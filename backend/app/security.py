import os
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from .database import connect

DEFAULT_SECRET_KEY = "dev-only-change-this-secret-before-production"
SECRET_KEY = os.getenv("SOYLE_SECRET_KEY", DEFAULT_SECRET_KEY)
DEPLOYMENT_MARKERS = ("VERCEL", "RAILWAY_ENVIRONMENT", "RENDER", "FLY_APP_NAME", "K_SERVICE")
IS_PRODUCTION = os.getenv("SOYLE_ENV", "").lower() in {"production", "staging"} or any(os.getenv(name) for name in DEPLOYMENT_MARKERS)
if IS_PRODUCTION and (SECRET_KEY == DEFAULT_SECRET_KEY or len(SECRET_KEY.encode()) < 32):
    raise RuntimeError("SOYLE_SECRET_KEY must be unique and at least 32 bytes in production")
COOKIE_SAMESITE = os.getenv("SOYLE_COOKIE_SAMESITE", "lax").strip().lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError("SOYLE_COOKIE_SAMESITE must be lax, strict, or none")
if COOKIE_SAMESITE == "none" and not IS_PRODUCTION:
    raise RuntimeError("SameSite=None cookies require a secure production environment")
ALGORITHM = "HS256"
AUTH_COOKIE_NAME = "__Host-soyle_access" if IS_PRODUCTION else "soyle_access"
CSRF_COOKIE_NAME = "__Host-soyle_csrf" if IS_PRODUCTION else "soyle_csrf"
COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60
password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)

def _create_session(subject: str, role: str, hours: int) -> str:
    expires = int((datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp())
    session_id = secrets.token_urlsafe(32)
    with connect() as db:
        db.execute("DELETE FROM auth_sessions WHERE expires_at<=?", (int(datetime.now(timezone.utc).timestamp()),))
        db.execute("INSERT INTO auth_sessions(id,subject,expires_at) VALUES(?,?,?)", (session_id, subject, expires))
    return jwt.encode({"sub": subject, "role": role, "exp": expires, "jti": session_id}, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user_id: int, role: str) -> str:
    return _create_session(str(user_id), role, 24)


def create_student_access_token(student_id: int) -> str:
    return _create_session(f"student:{student_id}", "student", 12)


def revoke_request_session(request: Request, bearer_token: str | None) -> None:
    token = bearer_token or request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        return
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"require": ["sub", "exp", "jti"]})
    except InvalidTokenError:
        return
    with connect() as db:
        db.execute("DELETE FROM auth_sessions WHERE id=? AND subject=?", (payload["jti"], payload["sub"]))


def set_auth_cookies(response: Response, token: str, *, max_age: int = COOKIE_MAX_AGE_SECONDS) -> str:
    csrf_token = secrets.token_urlsafe(32)
    cookie_options = {
        "secure": IS_PRODUCTION,
        "samesite": COOKIE_SAMESITE,
        "path": "/",
        "max_age": max_age,
    }
    response.set_cookie(AUTH_COOKIE_NAME, token, httponly=True, **cookie_options)
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, **cookie_options)
    return csrf_token


def clear_auth_cookies(response: Response) -> None:
    cookie_options = {"secure": IS_PRODUCTION, "samesite": COOKIE_SAMESITE, "path": "/"}
    response.delete_cookie(AUTH_COOKIE_NAME, **cookie_options)
    response.delete_cookie(CSRF_COOKIE_NAME, **cookie_options)


def get_current_user(request: Request, bearer_token: str | None = Depends(oauth2_scheme)) -> dict:
    error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Не удалось подтвердить авторизацию", headers={"WWW-Authenticate": "Bearer"})
    token = bearer_token or request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise error
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"require": ["sub", "exp", "jti"]})
        subject = str(payload.get("sub", ""))
    except InvalidTokenError:
        raise error
    with connect() as db:
        session = db.execute("SELECT id FROM auth_sessions WHERE id=? AND subject=? AND expires_at>?", (payload["jti"], subject, int(datetime.now(timezone.utc).timestamp()))).fetchone()
    if not session:
        raise error
    if subject.startswith("student:"):
        try:
            student_id = int(subject.split(":", 1)[1])
        except ValueError:
            raise error
        with connect() as db:
            row = db.execute("SELECT s.id,s.username,s.is_active,s.created_at,s.child_id,c.name FROM student_accounts s JOIN children c ON c.id=s.child_id WHERE s.id=?", (student_id,)).fetchone()
        if not row or not row["is_active"]:
            raise error
        return {"id": row["id"], "username": row["username"], "full_name": row["name"], "role": "student", "is_active": row["is_active"], "created_at": row["created_at"], "child_id": row["child_id"]}
    try:
        user_id = int(subject)
    except ValueError:
        raise error
    with connect() as db:
        row = db.execute("SELECT id,username,full_name,role,is_active,created_at FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not row["is_active"]:
        raise error
    return dict(row)

def require_roles(*roles: str):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return user
    return dependency

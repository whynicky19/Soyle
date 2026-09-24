import os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from .database import connect

SECRET_KEY = os.getenv("AI_SANA_SECRET_KEY", "dev-only-change-this-secret-before-production")
ALGORITHM = "HS256"
password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)

def create_access_token(user_id: int, role: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    return jwt.encode({"sub": str(user_id), "role": role, "exp": expires}, SECRET_KEY, algorithm=ALGORITHM)

def create_student_access_token(student_id: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=12)
    return jwt.encode({"sub": f"student:{student_id}", "role": "student", "exp": expires}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Не удалось подтвердить авторизацию", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        subject = str(payload.get("sub", ""))
    except InvalidTokenError:
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

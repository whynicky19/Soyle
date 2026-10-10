import json
import os
import hashlib
import secrets
import shutil
import subprocess
import tempfile
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .database import connect, init_db, now_iso
from .schemas import AACCardCreate, AACComposeRequest, AACFavoriteUpdate, AACPhraseCreate, ActiveUpdate, AssignedExerciseCreate, ChildCreate, ChildDeleteRequest, ChildGoalCreate, ConsentUpdate, ExerciseCreate, GoalStatusUpdate, HomeworkCreate, HomeworkResultUpdate, LearningSessionCreate, LoginRequest, RecommendationReview, RegisterRequest, RoleUpdate, SessionCreate, SpecialistAssignmentCreate, SpecialistRecommendationCreate, StudentAccountCreate, StudentLoginRequest, TTSRequest, UserSettingsUpdate
from .aac_grammar import compose_aac_phrase
from .security import AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, IS_PRODUCTION, clear_auth_cookies, create_access_token, create_student_access_token, get_current_user, hash_password, require_roles, set_auth_cookies, verify_password


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Söyle API", version="1.0.0", lifespan=lifespan)
CONSENT_VERSION = "2026-10-pilot-1"
allowed_origins = [origin.strip() for origin in os.getenv(
    "SOYLE_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
).split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
AUTH_ENTRY_PATHS = {"/api/auth/login", "/api/auth/register", "/api/auth/student-login"}


@app.middleware("http")
async def browser_security(request: Request, call_next):
    if request.method in UNSAFE_METHODS:
        origin = request.headers.get("origin")
        if origin and origin not in allowed_origins:
            return JSONResponse({"detail": "Источник запроса не разрешён"}, status_code=403)
        uses_cookie_auth = bool(request.cookies.get(AUTH_COOKIE_NAME)) and not request.headers.get("authorization")
        if uses_cookie_auth and request.url.path not in AUTH_ENTRY_PATHS:
            csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME, "")
            csrf_header = request.headers.get("x-csrf-token", "")
            if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
                return JSONResponse({"detail": "Проверка безопасности запроса не пройдена"}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    if request.url.path.startswith("/api/auth/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response

COURSE_UNITS = [
    {"id": "intro", "label": "Вводный курс", "title": "Я могу сообщить о важном", "targets": ["help", "desire", "need", "refusal", "choice"]},
    {"id": "food", "label": "Модуль 1", "title": "Еда и продукты", "targets": ["food", "request", "preference"]},
    {"id": "home", "label": "Модуль 2", "title": "Я и мой дом", "targets": ["family", "observation", "animals", "body", "clothes", "household"]},
    {"id": "play", "label": "Модуль 3", "title": "Игра и пространство", "targets": ["toys", "qualities", "opposites", "location", "spatial_phrase"]},
    {"id": "actions", "label": "Модуль 4", "title": "Действия и мой день", "targets": ["actions", "commands", "agent_action", "routine", "past_event"]},
    {"id": "feelings", "label": "Модуль 5", "title": "Диалог и состояние", "targets": ["feelings", "greeting", "answer", "question", "places"]},
    {"id": "motor", "label": "По назначению", "title": "Практика перед зеркалом", "targets": ["smile", "tube", "open", "teeth", "cheeks", "sequence"]},
]

SKILL_META = {
    "articulation": {"label": "Практика перед зеркалом"},
    "vocabulary": {"label": "Словарный запас"},
    "speech_comprehension": {"label": "Понимание речи"},
    "word_repetition": {"label": "Повторение слов"},
    "phrase_building": {"label": "Построение фраз"},
    "communication": {"label": "Коммуникация"},
}


def public_user(row) -> dict:
    result = {key: row[key] for key in ("id", "username", "full_name", "role", "is_active", "created_at")}
    result["email"] = row["username"]
    return result


def ensure_child_access(child_id: int, user: dict) -> dict:
    with connect() as db:
        child = db.execute("SELECT * FROM children WHERE id=?", (child_id,)).fetchone()
    if not child:
        raise HTTPException(404, "Профиль ребёнка не найден")
    if user["role"] == "parent" and child["parent_id"] != user["id"]:
        raise HTTPException(403, "Нет доступа к профилю ребёнка")
    if user["role"] == "student" and child["id"] != user["child_id"]:
        raise HTTPException(403, "Нет доступа к профилю ребёнка")
    if user["role"] == "specialist":
        with connect() as db:
            assignment = db.execute(
                """SELECT 1 FROM specialist_children sc
                   JOIN child_consents cc ON cc.child_id=sc.child_id
                   WHERE sc.specialist_id=? AND sc.child_id=?
                   AND cc.privacy_accepted=1 AND cc.specialist_sharing=1""",
                (user["id"], child_id),
            ).fetchone()
        if not assignment:
            raise HTTPException(403, "Родитель ещё не разрешил доступ специалисту или отозвал его")
    return dict(child)


def consent_record(child_id: int) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM child_consents WHERE child_id=?", (child_id,)).fetchone()
    if not row:
        return {
            "child_id": child_id,
            "privacy_accepted": False,
            "camera_processing": False,
            "specialist_sharing": False,
            "analytics_processing": False,
            "version": CONSENT_VERSION,
            "updated_at": None,
            "consented_by_user_id": None,
            "privacy_accepted_at": None,
            "camera_processing_at": None,
            "specialist_sharing_at": None,
            "analytics_processing_at": None,
        }
    result = dict(row)
    for key in ("privacy_accepted", "camera_processing", "specialist_sharing", "analytics_processing"):
        result[key] = bool(result.get(key, False))
    return result


def ensure_privacy_consent(child_id: int) -> dict:
    consent = consent_record(child_id)
    if not consent["privacy_accepted"]:
        raise HTTPException(403, "Сначала родителю нужно разрешить сохранение данных ребёнка")
    return consent


def ensure_analytics_consent(child_id: int) -> dict:
    consent = ensure_privacy_consent(child_id)
    if not consent["analytics_processing"]:
        raise HTTPException(403, "История и необязательная аналитика отключены родителем")
    return consent


def ensure_motor_assignment(db, child_id: int, exercise: dict) -> None:
    if exercise["module"] != "motor":
        return
    assigned = db.execute(
        "SELECT 1 FROM assigned_exercises WHERE child_id=? AND exercise_id=? LIMIT 1",
        (child_id, exercise["id"]),
    ).fetchone()
    if not assigned:
        raise HTTPException(403, "Моторное упражнение доступно только по явному назначению специалиста")


def eligible_exercise_rows(db, child_id: int) -> list[dict]:
    return [dict(row) for row in db.execute(
        """SELECT e.* FROM exercises e
           WHERE e.is_active=1 AND (
             e.module<>'motor' OR EXISTS (
               SELECT 1 FROM assigned_exercises a
               WHERE a.child_id=? AND a.exercise_id=e.id
             )
           ) ORDER BY e.module,e.difficulty,e.id""",
        (child_id,),
    ).fetchall()]


def calculate_game_score(correct_answers: int, attempts_count: int) -> int:
    if attempts_count <= 0:
        return 0
    return round(correct_answers / attempts_count * 100)


def settings_key(user: dict) -> str:
    account_type = "student" if user["role"] == "student" else "user"
    return f"{account_type}:{user['id']}"


def public_settings(row=None) -> dict:
    if not row:
        return {"camera_enabled": False, "sound_enabled": True, "calm_mode": False, "theme": "peach", "language": "ru"}
    return {
        "camera_enabled": bool(row["camera_enabled"]),
        "sound_enabled": bool(row["sound_enabled"]),
        "calm_mode": bool(row["calm_mode"]),
        "theme": row["theme"],
        "language": row["language"] if "language" in row.keys() else "ru",
    }


def request_client_key(request: Request) -> str:
    if os.getenv("SOYLE_TRUST_PROXY_HEADERS", "").strip().lower() in {"1", "true", "yes", "on"}:
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


def auth_identifier(kind: str, username: str, client_key: str) -> str:
    value = f"{kind}:{username.strip().lower()}:{client_key}".encode()
    return hashlib.sha256(value).hexdigest()


def enforce_login_limit(identifiers: tuple[str, str]) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    with connect() as db:
        account_failures = db.execute(
            "SELECT COUNT(*) count FROM auth_attempts WHERE identifier=? AND successful=0 AND attempted_at>=?",
            (identifiers[0], cutoff),
        ).fetchone()["count"]
        client_failures = db.execute(
            "SELECT COUNT(*) count FROM auth_attempts WHERE identifier=? AND successful=0 AND attempted_at>=?",
            (identifiers[1], cutoff),
        ).fetchone()["count"]
    if account_failures >= 5 or client_failures >= 30:
        raise HTTPException(429, "Слишком много попыток входа. Попробуйте снова через 15 минут")


def record_login_attempt(identifiers: tuple[str, str], successful: bool) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    with connect() as db:
        for identifier in identifiers:
            db.execute("INSERT INTO auth_attempts(identifier,successful,attempted_at) VALUES(?,?,?)", (identifier, int(successful), now_iso()))
        if successful:
            for identifier in identifiers:
                db.execute("DELETE FROM auth_attempts WHERE identifier=? AND successful=0", (identifier,))
        db.execute("DELETE FROM auth_attempts WHERE attempted_at<?", (cutoff,))


def login_identifiers(kind: str, username: str, request: Request) -> tuple[str, str]:
    client_key = request_client_key(request)
    return auth_identifier(kind, username, client_key), auth_identifier(kind, "*", client_key)


def auth_response(request: Request, response: Response, user: dict, token: str, *, max_age: int = 24 * 60 * 60) -> dict:
    csrf_token = set_auth_cookies(response, token, max_age=max_age)
    result = {"user": user, "csrf_token": csrf_token}
    if not IS_PRODUCTION and request.headers.get("x-soyle-auth-mode") == "bearer":
        result.update({"access_token": token, "token_type": "bearer"})
    return result


def audit(user: dict, action: str, object_type: str, object_id: int | str | None = None, metadata: dict | None = None) -> None:
    actor_type = "student" if user.get("role") == "student" else "user"
    with connect() as db:
        db.execute(
            "INSERT INTO audit_events(actor_key,action,object_type,object_id,metadata,created_at) VALUES(?,?,?,?,?,?)",
            (f"{actor_type}:{user['id']}", action, object_type, str(object_id) if object_id is not None else None, json.dumps(metadata or {}, ensure_ascii=False), now_iso()),
        )


def create_module_notification(db, child_id: int, exercise_id: int) -> None:
    exercise = db.execute("SELECT target FROM exercises WHERE id=?", (exercise_id,)).fetchone()
    if not exercise:
        return
    unit = next((item for item in COURSE_UNITS if exercise["target"] in item["targets"]), None)
    if not unit:
        return
    placeholders = ",".join("?" for _ in unit["targets"])
    active_targets = {
        row["target"] for row in db.execute(
            f"SELECT target FROM exercises WHERE is_active=1 AND target IN ({placeholders})",
            tuple(unit["targets"]),
        ).fetchall()
    }
    if not active_targets:
        return
    completed_targets = {
        row["target"] for row in db.execute(
            f"""SELECT DISTINCT e.target FROM sessions s JOIN exercises e ON e.id=s.exercise_id
                WHERE s.child_id=? AND s.measurement_version>=1
                AND s.attempt_status IN ('completed','participated') AND e.is_active=1
                AND e.target IN ({placeholders})""",
            (child_id, *unit["targets"]),
        ).fetchall()
    }
    if not active_targets.issubset(completed_targets):
        return
    child = db.execute("SELECT name,parent_id FROM children WHERE id=?", (child_id,)).fetchone()
    if not child:
        return
    db.execute(
        """INSERT INTO notifications(user_id,child_id,event_key,title,message,metadata,created_at)
           VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING""",
        (
            child["parent_id"], child_id, f"module_complete:{child_id}:{unit['id']}",
            f"{unit['label']}: {unit['title']} завершён",
            f"{child['name']}: модуль отмечен пройденным. Следующий домашний шаг при необходимости назначит специалист.",
            json.dumps({"unit_id": unit["id"], "unit_label": unit["label"], "unit_title": unit["title"]}, ensure_ascii=False),
            now_iso(),
        ),
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "soyle-api"}


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest, request: Request, response: Response) -> dict:
    with connect() as db:
        username = payload.username.lower()
        if db.execute("SELECT 1 FROM users WHERE lower(username)=?", (username,)).fetchone():
            raise HTTPException(409, "Этот логин уже занят")
        cursor = db.execute(
            "INSERT INTO users(email,username,password_hash,full_name,role,created_at) VALUES(?,?,?,?,?,?) RETURNING id",
            (f"{username}@local.soyle", username, hash_password(payload.password), payload.full_name, "parent", now_iso()),
        )
        user_id = cursor.fetchone()["id"]
        row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    user = public_user(row)
    return auth_response(request, response, user, create_access_token(user_id, "parent"))


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request, response: Response) -> dict:
    identifiers = login_identifiers("adult", payload.username, request)
    enforce_login_limit(identifiers)
    with connect() as db:
        row = db.execute("SELECT * FROM users WHERE lower(username)=lower(?)", (payload.username,)).fetchone()
    if not row or not verify_password(payload.password, row["password_hash"]):
        record_login_attempt(identifiers, False)
        raise HTTPException(401, "Неверный логин или пароль")
    if not row["is_active"]:
        record_login_attempt(identifiers, False)
        raise HTTPException(403, "Аккаунт отключён администратором")
    record_login_attempt(identifiers, True)
    user = public_user(row)
    return auth_response(request, response, user, create_access_token(row["id"], row["role"]))


@app.post("/api/auth/student-login")
def student_login(payload: StudentLoginRequest, request: Request, response: Response) -> dict:
    identifiers = login_identifiers("student", payload.username, request)
    enforce_login_limit(identifiers)
    with connect() as db:
        row = db.execute("SELECT s.*,c.name FROM student_accounts s JOIN children c ON c.id=s.child_id WHERE lower(s.username)=lower(?)", (payload.username,)).fetchone()
    if not row or not verify_password(payload.pin, row["pin_hash"]):
        record_login_attempt(identifiers, False)
        raise HTTPException(401, "Неверный логин или PIN")
    if not row["is_active"]:
        record_login_attempt(identifiers, False)
        raise HTTPException(403, "Ученический аккаунт отключён")
    record_login_attempt(identifiers, True)
    user = {"id": row["id"], "username": row["username"], "full_name": row["name"], "role": "student", "is_active": row["is_active"], "created_at": row["created_at"], "child_id": row["child_id"]}
    return auth_response(request, response, user, create_student_access_token(row["id"]), max_age=12 * 60 * 60)


@app.get("/api/auth/me")
def me(request: Request, user: dict = Depends(get_current_user)) -> dict:
    return {**user, "csrf_token": request.cookies.get(CSRF_COOKIE_NAME, "")}


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response) -> None:
    clear_auth_cookies(response)


@app.get("/api/settings")
def get_settings(user: dict = Depends(get_current_user)) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM user_settings WHERE user_key=?", (settings_key(user),)).fetchone()
    return public_settings(row)


@app.put("/api/settings")
def update_settings(payload: UserSettingsUpdate, user: dict = Depends(get_current_user)) -> dict:
    with connect() as db:
        db.execute(
            """INSERT INTO user_settings(user_key,camera_enabled,sound_enabled,calm_mode,theme,language,updated_at)
               VALUES(?,?,?,?,?,?,?)
               ON CONFLICT(user_key) DO UPDATE SET camera_enabled=excluded.camera_enabled,
               sound_enabled=excluded.sound_enabled,calm_mode=excluded.calm_mode,
               theme=excluded.theme,language=excluded.language,updated_at=excluded.updated_at""",
            (settings_key(user), int(payload.camera_enabled), int(payload.sound_enabled), int(payload.calm_mode), payload.theme, payload.language, now_iso()),
        )
        row = db.execute("SELECT * FROM user_settings WHERE user_key=?", (settings_key(user),)).fetchone()
    return public_settings(row)


@app.post("/api/tts")
def text_to_speech(payload: TTSRequest, _: dict = Depends(get_current_user)) -> FileResponse:
    text = " ".join(payload.text.split()).strip()
    cache_dir = Path(tempfile.gettempdir()) / "soyle-tts-v1"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha256(f"{payload.language}|{text}|{payload.rate:.2f}".encode("utf-8")).hexdigest()
    output_path = cache_dir / f"{cache_key}.wav"
    if not output_path.exists():
        source_path = cache_dir / f"{cache_key}.aiff"
        say_path = shutil.which("say")
        ffmpeg_path = shutil.which("ffmpeg")
        if not say_path or not ffmpeg_path:
            raise HTTPException(503, "Локальный голосовой движок недоступен")
        words_per_minute = max(125, min(215, round(190 * payload.rate)))
        default_voices = {"ru": "Milena", "kk": "Aigerim", "en": "Samantha"}
        voice = os.getenv(f"SOYLE_TTS_VOICE_{payload.language.upper()}", os.getenv("SOYLE_TTS_VOICE", default_voices[payload.language]))
        command = [say_path, "-v", voice, "-r", str(words_per_minute), "-o", str(source_path), text]
        generated = subprocess.run(command, capture_output=True, timeout=20, check=False)
        if generated.returncode != 0 or not source_path.exists():
            raise HTTPException(503, f"Голос для языка {payload.language} недоступен")
        filtered = subprocess.run([
            ffmpeg_path, "-loglevel", "error", "-y", "-i", str(source_path),
            "-af", "highpass=f=60,lowpass=f=10500,areverse,afade=t=in:st=0:d=0.12,areverse,apad=pad_dur=0.08",
            "-ar", "24000", "-ac", "1", str(output_path),
        ], capture_output=True, timeout=20, check=False)
        source_path.unlink(missing_ok=True)
        if filtered.returncode != 0 or not output_path.exists():
            output_path.unlink(missing_ok=True)
            raise HTTPException(503, "Не удалось обработать озвучивание")
    return FileResponse(output_path, media_type="audio/wav", filename="soyle-speech.wav", headers={"Cache-Control": "private, max-age=86400"})


@app.get("/api/notifications")
def list_notifications(user: dict = Depends(require_roles("parent"))) -> dict:
    with connect() as db:
        completed_rows = db.execute(
            """SELECT DISTINCT s.child_id,s.exercise_id FROM sessions s
               JOIN children c ON c.id=s.child_id
               WHERE c.parent_id=? AND s.exercise_id IS NOT NULL AND s.measurement_version>=1
               AND s.attempt_status IN ('completed','participated')""",
            (user["id"],),
        ).fetchall()
        for completed in completed_rows:
            create_module_notification(db, completed["child_id"], completed["exercise_id"])
        rows = db.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30", (user["id"],)).fetchall()
    items = [{**dict(row), "metadata": json.loads(row["metadata"]), "is_read": bool(row["is_read"])} for row in rows]
    return {"unread": sum(1 for item in items if not item["is_read"]), "items": items}


@app.patch("/api/notifications/{notification_id}/read")
def read_notification(notification_id: int, user: dict = Depends(require_roles("parent"))) -> dict:
    with connect() as db:
        db.execute("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?", (notification_id, user["id"]))
        row = db.execute("SELECT id,is_read FROM notifications WHERE id=? AND user_id=?", (notification_id, user["id"])).fetchone()
    if not row:
        raise HTTPException(404, "Уведомление не найдено")
    return {"id": row["id"], "is_read": bool(row["is_read"])}


@app.patch("/api/notifications/actions/read-all")
def read_all_notifications(user: dict = Depends(require_roles("parent"))) -> dict:
    with connect() as db:
        cursor = db.execute("UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0", (user["id"],))
    return {"updated": cursor.rowcount}


@app.get("/api/children")
def list_children(user: dict = Depends(get_current_user)) -> list[dict]:
    with connect() as db:
        if user["role"] == "parent":
            rows = db.execute("SELECT * FROM children WHERE parent_id=? ORDER BY id", (user["id"],)).fetchall()
        elif user["role"] == "student":
            rows = db.execute("SELECT * FROM children WHERE id=?", (user["child_id"],)).fetchall()
        elif user["role"] == "specialist":
            rows = db.execute(
                """SELECT c.*,u.full_name parent_name,u.username parent_username
                   FROM specialist_children sc JOIN children c ON c.id=sc.child_id
                   JOIN users u ON u.id=c.parent_id
                   JOIN child_consents cc ON cc.child_id=c.id
                   WHERE sc.specialist_id=? AND cc.privacy_accepted=1
                   AND cc.specialist_sharing=1 ORDER BY c.id""",
                (user["id"],),
            ).fetchall()
        else:
            rows = db.execute("SELECT c.*,u.full_name parent_name,u.username parent_username FROM children c JOIN users u ON u.id=c.parent_id ORDER BY c.id").fetchall()
    return [dict(row) for row in rows]


@app.post("/api/children", status_code=201)
def create_child(payload: ChildCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    if payload.birth_date > date.today():
        raise HTTPException(422, "Дата рождения не может быть в будущем")
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO children(parent_id,name,birth_date,primary_module,avatar_color) VALUES(?,?,?,?,?) RETURNING id",
            (user["id"], payload.name, payload.birth_date.isoformat(), payload.primary_module, payload.avatar_color),
        )
        row = db.execute("SELECT * FROM children WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    return dict(row)


@app.get("/api/children/{child_id}/student-account")
def get_student_account(child_id: int, user: dict = Depends(require_roles("parent"))) -> dict | None:
    ensure_child_access(child_id, user)
    with connect() as db:
        row = db.execute("SELECT id,username,is_active,created_at FROM student_accounts WHERE child_id=?", (child_id,)).fetchone()
    return dict(row) if row else None


@app.post("/api/children/{child_id}/student-account")
def save_student_account(child_id: int, payload: StudentAccountCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    username = payload.username.lower()
    with connect() as db:
        conflict = db.execute("SELECT child_id FROM student_accounts WHERE lower(username)=? AND child_id<>?", (username, child_id)).fetchone()
        if conflict:
            raise HTTPException(409, "Этот ученический логин уже занят")
        existing = db.execute("SELECT id FROM student_accounts WHERE child_id=?", (child_id,)).fetchone()
        if existing:
            db.execute("UPDATE student_accounts SET username=?,pin_hash=?,is_active=1 WHERE child_id=?", (username, hash_password(payload.pin), child_id))
        else:
            db.execute("INSERT INTO student_accounts(child_id,username,pin_hash,created_at) VALUES(?,?,?,?)", (child_id, username, hash_password(payload.pin), now_iso()))
        row = db.execute("SELECT id,username,is_active,created_at FROM student_accounts WHERE child_id=?", (child_id,)).fetchone()
    return dict(row)


@app.get("/api/exercises")
def list_exercises(module: str | None = Query(default=None), child_id: int | None = Query(default=None), user: dict = Depends(get_current_user)) -> list[dict]:
    with connect() as db:
        if user["role"] in {"admin", "specialist"}:
            rows = [dict(row) for row in db.execute("SELECT * FROM exercises WHERE is_active=1 ORDER BY module,difficulty,id").fetchall()]
        elif child_id is not None:
            ensure_child_access(child_id, user)
            rows = eligible_exercise_rows(db, child_id)
        else:
            rows = [dict(row) for row in db.execute("SELECT * FROM exercises WHERE is_active=1 AND module<>'motor' ORDER BY module,difficulty,id").fetchall()]
    if module:
        rows = [row for row in rows if row["module"] == module]
    return rows


@app.get("/api/aac/cards/{child_id}")
def aac_cards(child_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute(
            """SELECT c.*,CASE WHEN f.card_id IS NULL THEN 0 ELSE 1 END favorite
               FROM aac_cards c LEFT JOIN aac_favorites f ON f.card_id=c.id AND f.child_id=?
               WHERE c.is_active=1 AND c.language='ru' AND (c.child_id IS NULL OR c.child_id=?)
               ORDER BY c.is_core DESC,c.category,c.id""",
            (child_id, child_id),
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/aac/cards", status_code=201)
def create_aac_card(payload: AACCardCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO aac_cards(child_id,label,speech,category,lemma,grammatical_role,language,pictogram,image,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
            (payload.child_id, payload.label, payload.speech, payload.category, payload.lemma or payload.label.lower(), payload.grammatical_role, payload.language, payload.pictogram or payload.image, payload.image, user["id"], now_iso()),
        )
        row = db.execute("SELECT *,0 favorite FROM aac_cards WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    return dict(row)


@app.patch("/api/aac/cards/{card_id}/favorite")
def favorite_aac_card(card_id: int, child_id: int, payload: AACFavoriteUpdate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    with connect() as db:
        card = db.execute("SELECT id FROM aac_cards WHERE id=? AND is_active=1 AND language='ru' AND (child_id IS NULL OR child_id=?)", (card_id, child_id)).fetchone()
        if not card:
            raise HTTPException(404, "Карточка не найдена")
        if payload.favorite:
            db.execute("INSERT INTO aac_favorites(child_id,card_id) VALUES(?,?) ON CONFLICT DO NOTHING", (child_id, card_id))
        else:
            db.execute("DELETE FROM aac_favorites WHERE child_id=? AND card_id=?", (child_id, card_id))
    return {"card_id": card_id, "favorite": payload.favorite}


@app.post("/api/aac/compose")
def compose_aac(payload: AACComposeRequest, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    unique_ids = list(dict.fromkeys(payload.card_ids))
    if len(unique_ids) != len(payload.card_ids):
        raise HTTPException(422, "Одна карточка не должна повторяться в сообщении")
    placeholders = ",".join("?" for _ in unique_ids)
    with connect() as db:
        rows = db.execute(
            f"SELECT id,label,speech,lemma,grammatical_role,language,pictogram FROM aac_cards WHERE is_active=1 AND language='ru' AND (child_id IS NULL OR child_id=?) AND id IN ({placeholders})",
            (payload.child_id, *unique_ids),
        ).fetchall()
    by_id = {row["id"]: dict(row) for row in rows}
    if len(by_id) != len(unique_ids):
        raise HTTPException(422, "Одна из карточек недоступна")
    return compose_aac_phrase([by_id[card_id] for card_id in unique_ids], payload.language)


@app.post("/api/aac/history", status_code=201)
def save_aac_phrase(payload: AACPhraseCreate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_analytics_consent(payload.child_id)
    unique_ids = list(dict.fromkeys(payload.card_ids))
    if len(unique_ids) != len(payload.card_ids):
        raise HTTPException(422, "Одна карточка не должна повторяться в сообщении")
    placeholders = ",".join("?" for _ in unique_ids)
    with connect() as db:
        cards = db.execute(
            f"SELECT id,label,speech,lemma,grammatical_role,language,pictogram FROM aac_cards WHERE is_active=1 AND language='ru' AND (child_id IS NULL OR child_id=?) AND id IN ({placeholders})",
            (payload.child_id, *unique_ids),
        ).fetchall()
        by_id = {row["id"]: dict(row) for row in cards}
        if len(by_id) != len(unique_ids):
            raise HTTPException(422, "Одна из карточек недоступна")
        ordered_cards = [by_id[card_id] for card_id in unique_ids]
        languages = {card.get("language") or "ru" for card in ordered_cards}
        if len(languages) != 1:
            raise HTTPException(422, "Карточки разных языков нельзя сохранять как одно сообщение")
        composed = compose_aac_phrase(ordered_cards, languages.pop())
        if not composed["valid"]:
            raise HTTPException(422, composed["reason"])
        cursor = db.execute(
            "INSERT INTO aac_phrase_history(child_id,user_key,phrase,card_ids,created_at) VALUES(?,?,?,?,?) RETURNING id",
            (payload.child_id, settings_key(user), composed["phrase"], json.dumps(unique_ids), now_iso()),
        )
        row = db.execute("SELECT * FROM aac_phrase_history WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    result = dict(row)
    result["card_ids"] = json.loads(result["card_ids"])
    return result


@app.get("/api/aac/history/{child_id}")
def aac_history(child_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    consent = consent_record(child_id)
    if not consent["privacy_accepted"] or not consent["analytics_processing"]:
        return []
    with connect() as db:
        rows = db.execute("SELECT * FROM aac_phrase_history WHERE child_id=? ORDER BY id DESC LIMIT 12", (child_id,)).fetchall()
    return [{**dict(row), "card_ids": json.loads(row["card_ids"])} for row in rows]


@app.post("/api/sessions", status_code=201)
def create_session(payload: SessionCreate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    if (payload.attempts_count is None) != (payload.correct_answers is None):
        raise HTTPException(422, "Число попыток и правильных ответов нужно передавать вместе")
    if payload.attempts_count is not None and payload.correct_answers is not None and payload.correct_answers > payload.attempts_count:
        raise HTTPException(422, "Правильных ответов не может быть больше числа попыток")
    attempt_status = "refused" if payload.prompt_level == "refused" and payload.attempt_status == "completed" else payload.attempt_status
    with connect() as db:
        exercise = db.execute("SELECT id,module,is_active FROM exercises WHERE id=?", (payload.exercise_id,)).fetchone()
        if not exercise or not exercise["is_active"]:
            raise HTTPException(422, "Задание не найдено или находится в архиве")
        if exercise["module"] != payload.module:
            raise HTTPException(422, "Задание не относится к выбранному модулю")
        ensure_motor_assignment(db, payload.child_id, exercise)
        if exercise["module"] in {"motor", "mixed"} and attempt_status == "completed":
            attempt_status = "participated"
        if attempt_status == "completed" and (payload.attempts_count is None or payload.correct_answers is None):
            raise HTTPException(422, "Для игрового результата укажите число попыток и правильных ответов")
        if attempt_status == "completed" and payload.attempts_count == 0:
            raise HTTPException(422, "Для завершённой игровой попытки укажите хотя бы один ответ")
        game_score = calculate_game_score(payload.correct_answers or 0, payload.attempts_count or 0) if attempt_status == "completed" else 0
        if payload.learning_session_id:
            learning = db.execute("SELECT * FROM learning_sessions WHERE id=? AND child_id=?", (payload.learning_session_id, payload.child_id)).fetchone()
            if not learning:
                raise HTTPException(422, "Занятие не найдено")
            planned_ids = json.loads(learning["exercise_ids"])
            if payload.exercise_id not in planned_ids:
                raise HTTPException(422, "Это упражнение не входит в текущее занятие")
        cursor = db.execute(
            """INSERT INTO sessions(child_id,exercise_id,module,score,duration_seconds,details,measurement_version,
               learning_session_id,sequence_index,independence,prompt_level,response_ms,communication_initiatives,
               attempts_count,correct_answers,prompts_used,attempt_status,created_at)
               VALUES(?,?,?,?,?,?,3,?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
            (payload.child_id, payload.exercise_id, payload.module, game_score, payload.duration_seconds,
             json.dumps({**payload.details, "measurement_source": "caregiver_or_user_observation"}, ensure_ascii=False), payload.learning_session_id, payload.sequence_index,
             payload.independence, payload.prompt_level, payload.response_ms, payload.communication_initiatives,
             payload.attempts_count, payload.correct_answers, payload.prompts_used, attempt_status, now_iso()),
        )
        row = db.execute("SELECT * FROM sessions WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
        if payload.learning_session_id:
            completed_count = db.execute("SELECT COUNT(DISTINCT exercise_id) count FROM sessions WHERE learning_session_id=? AND measurement_version>=1 AND attempt_status IN ('completed','participated','refused')", (payload.learning_session_id,)).fetchone()["count"]
            planned_count = len(json.loads(learning["exercise_ids"]))
            if completed_count >= planned_count:
                db.execute("UPDATE learning_sessions SET status='completed',current_index=?,completed_at=? WHERE id=?", (planned_count, now_iso(), payload.learning_session_id))
            else:
                db.execute("UPDATE learning_sessions SET current_index=? WHERE id=?", (completed_count, payload.learning_session_id))
        if attempt_status in {"completed", "participated"}:
            db.execute("UPDATE assigned_exercises SET status='completed',completed_at=? WHERE child_id=? AND exercise_id=? AND status='assigned'", (now_iso(), payload.child_id, payload.exercise_id))
            create_module_notification(db, payload.child_id, payload.exercise_id)
    result = dict(row)
    result["details"] = json.loads(result["details"])
    result["awarded_stars"] = 1 if attempt_status == "participated" else max(1, game_score // 20) if attempt_status == "completed" else 0
    return result


def build_skill_progress(rows, exercise_rows) -> list[dict]:
    results: list[dict] = []
    for skill, meta in SKILL_META.items():
        skill_exercise_ids = {row["id"] for row in exercise_rows if row.get("skill") == skill}
        skill_rows = [row for row in rows if row["exercise_id"] in skill_exercise_ids]
        scored_rows = [row for row in skill_rows if row.get("attempt_status") == "completed" and row.get("attempts_count")]
        completion_rows = [row for row in skill_rows if row.get("attempt_status") in {"completed", "participated"}]
        average_game_score = round(sum(row["score"] for row in scored_rows) / len(scored_rows)) if scored_rows else None
        results.append({
            "skill": skill,
            "label": meta["label"],
            "value": average_game_score,
            "average_game_score": average_game_score,
            "measurement": "game_result" if scored_rows else "participation",
            "recent_change": None,
            "sessions": len(skill_rows),
            "participations": len(completion_rows),
            "completed_exercises": len({row["exercise_id"] for row in completion_rows}),
            "total_exercises": len(skill_exercise_ids),
        })
    return results


def progress_data(child_id: int, user: dict) -> dict:
    child = ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT * FROM sessions WHERE child_id=? AND measurement_version>=1 ORDER BY created_at,id", (child_id,)).fetchall()
        exercise_rows = eligible_exercise_rows(db, child_id)
    rows = [dict(row) for row in rows]
    scored_rows = [row for row in rows if row.get("attempt_status", "completed") == "completed"]
    completion_rows = [row for row in rows if row.get("attempt_status", "completed") in {"completed", "participated"}]
    by_module: dict[str, list[int]] = defaultdict(list)
    for row in scored_rows:
        by_module[row["module"]].append(row["score"])
    labels = {"motor": "Практика по назначению", "sensory": "Игровые задания на слух", "mixed": "AAC-коммуникация"}
    skills = [{"module": module, "label": labels[module], "value": round(sum(by_module[module]) / len(by_module[module])) if by_module[module] else None, "sessions": len(by_module[module])} for module in ("motor", "sensory", "mixed")]
    active_exercise_ids = {
        module: {row["id"] for row in exercise_rows if row["module"] == module}
        for module in ("motor", "sensory", "mixed")
    }
    exercise_counts = {module: len(ids) for module, ids in active_exercise_ids.items()}
    completed = {
        module: len({row["exercise_id"] for row in completion_rows if row["module"] == module and row["exercise_id"] in active_exercise_ids[module]})
        for module in ("motor", "sensory", "mixed")
    }
    completion = {
        module: min(100, round(completed[module] / max(exercise_counts.get(module, 1), 1) * 100))
        for module in ("motor", "sensory", "mixed")
    }
    overall = round(sum(completed.values()) / max(sum(exercise_counts.values()), 1) * 100)
    skill_progress = build_skill_progress(rows, exercise_rows)
    observed_rows = [row for row in rows if row.get("attempt_status") in {"completed", "participated"}]
    independence_values = [row["independence"] for row in observed_rows if row.get("independence") is not None]
    response_values = [row["response_ms"] for row in observed_rows if row.get("response_ms") is not None]
    prompt_breakdown = {name: sum(1 for row in rows if row.get("prompt_level") == name) for name in ("independent", "minimal", "full", "refused")}
    with connect() as db:
        homework_rows = [dict(row) for row in db.execute("SELECT result,completed_at FROM homework_assignments WHERE child_id=? AND result IS NOT NULL ORDER BY completed_at", (child_id,)).fetchall()]
    current_home = homework_rows[-6:]
    previous_home = homework_rows[-12:-6]
    independent_now = sum(1 for row in current_home if row["result"] == "independent")
    independent_before = sum(1 for row in previous_home if row["result"] == "independent")
    plain_language = None
    if current_home:
        plain_language = f"В последних {len(current_home)} домашних ситуациях ребёнок справился самостоятельно {independent_now} раз. В предыдущих {len(previous_home)} — {independent_before} раз."
    return {
        "child": child, "overall": overall, "total_sessions": len(rows), "skills": skills,
        "skill_progress": skill_progress, "module_completion": completion, "module_completed": completed,
        "recent": rows[-8:][::-1],
        "support_metrics": {
            "average_independence": round(sum(independence_values) / len(independence_values)) if independence_values else None,
            "average_response_ms": round(sum(response_values) / len(response_values)) if response_values else None,
            "communication_initiatives": sum(row.get("communication_initiatives") or 0 for row in rows),
            "prompt_breakdown": prompt_breakdown,
            "attempts_count": sum(row.get("attempts_count") or 0 for row in rows),
            "correct_answers": sum(row.get("correct_answers") or 0 for row in scored_rows),
            "prompts_used": sum(row.get("prompts_used") or 0 for row in rows),
            "refusals": sum(1 for row in rows if row.get("attempt_status") == "refused"),
            "breaks": sum(1 for row in rows if row.get("attempt_status") == "break"),
            "technical_errors": sum(1 for row in rows if row.get("attempt_status") == "technical_error"),
            "participations": sum(1 for row in rows if row.get("attempt_status") == "participated"),
            "game_result_average": round(sum(row["score"] for row in scored_rows) / len(scored_rows)) if scored_rows else None,
            "homework_completed": len(homework_rows),
            "plain_language": plain_language,
        },
    }


@app.get("/api/progress/{child_id}")
def progress(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    return progress_data(child_id, user)


@app.get("/api/dashboard/{child_id}")
def dashboard(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    child = ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT id,exercise_id,module,score,duration_seconds,attempts_count,correct_answers,prompts_used,attempt_status,created_at FROM sessions WHERE child_id=? AND measurement_version>=1 ORDER BY created_at,id", (child_id,)).fetchall()
        exercise_rows = eligible_exercise_rows(db, child_id)
    scored_rows = [row for row in rows if row["attempt_status"] == "completed"]
    completion_rows = [row for row in rows if row["attempt_status"] in {"completed", "participated"}]

    local_zone = ZoneInfo("Asia/Almaty")
    today = datetime.now(local_zone).date()
    week_start = today - timedelta(days=today.weekday())
    parsed = []
    for row in rows:
        try:
            stamp = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue
        parsed.append((row, stamp.astimezone(local_zone).date()))

    active_dates = sorted({day for _, day in parsed}, reverse=True)
    streak = 0
    cursor = today if today in active_dates else today - timedelta(days=1)
    while cursor in active_dates:
        streak += 1
        cursor -= timedelta(days=1)

    today_rows = [row for row, day in parsed if day == today]
    week_rows = [row for row, day in parsed if week_start <= day <= today]
    by_module: dict[str, list[int]] = defaultdict(list)
    for row in scored_rows:
        by_module[row["module"]].append(row["score"])
    module_accuracy = {
        module: round(sum(scores) / len(scores)) if scores else None
        for module, scores in ((name, by_module[name]) for name in ("motor", "sensory", "mixed"))
    }
    active_exercise_ids = {
        module: {row["id"] for row in exercise_rows if row["module"] == module}
        for module in ("motor", "sensory", "mixed")
    }
    exercise_counts = {module: len(ids) for module, ids in active_exercise_ids.items()}
    module_completed = {
        module: len({row["exercise_id"] for row in completion_rows if row["module"] == module and row["exercise_id"] in active_exercise_ids[module]})
        for module in ("motor", "sensory", "mixed")
    }
    module_completion = {
        module: min(100, round(module_completed[module] / max(exercise_counts.get(module, 1), 1) * 100))
        for module in ("motor", "sensory", "mixed")
    }
    daily = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        point = {"date": day.isoformat(), "label": day.strftime("%d.%m")}
        for module in ("motor", "sensory", "mixed"):
            scores = [row["score"] for row, row_day in parsed if row_day == day and row["module"] == module and row["attempt_status"] == "completed"]
            point[module] = round(sum(scores) / len(scores)) if scores else None
        daily.append(point)
    total_seconds = sum(row["duration_seconds"] for row in rows)
    today_seconds = sum(row["duration_seconds"] for row in today_rows)
    week_seconds = sum(row["duration_seconds"] for row in week_rows)
    row_dicts = [dict(row) for row in rows]
    skill_progress = build_skill_progress(row_dicts, exercise_rows)
    return {
        "child": child,
        "total_sessions": len(rows),
        "total_minutes": round(total_seconds / 60, 1),
        "today_sessions": len(today_rows),
        "today_minutes": round(today_seconds / 60, 1),
        "week_sessions": len(week_rows),
        "week_minutes": round(week_seconds / 60, 1),
        "streak_days": streak,
        "stars": sum(max(1, row["score"] // 20) for row in scored_rows) + sum(1 for row in completion_rows if row["attempt_status"] == "participated"),
        "overall": round(sum(module_completed.values()) / max(sum(exercise_counts.values()), 1) * 100),
        "module_progress": module_accuracy,
        "module_accuracy": module_accuracy,
        "module_completion": module_completion,
        "module_completed": module_completed,
        "completed_exercise_ids": sorted({row["exercise_id"] for row in completion_rows if row["exercise_id"] is not None}),
        "module_sessions": {module: sum(1 for row in completion_rows if row["module"] == module) for module in ("motor", "sensory", "mixed")},
        "active_exercises": exercise_counts,
        "skill_progress": skill_progress,
        "weakest_skill": None,
        "recommended_exercise": None,
        "progress_delta": None,
        "daily": daily,
        "achievements": {
            "first_five": len(completion_rows) >= 5,
            "good_listener": sum(1 for row in completion_rows if row["module"] == "sensory") >= 5,
            "phrase_master": sum(1 for row in completion_rows if row["module"] == "mixed") >= 5,
            "week_streak": streak >= 7,
        },
        "recent": [dict(row) for row in rows[-5:]][::-1],
    }


@app.get("/api/session-plan/{child_id}")
def session_plan(child_id: int, minutes: int = Query(default=5), user: dict = Depends(get_current_user)) -> dict:
    if minutes not in {3, 5, 10}:
        raise HTTPException(422, "Продолжительность занятия: 3, 5 или 10 минут")
    child = ensure_child_access(child_id, user)
    with connect() as db:
        assigned = db.execute(
            """SELECT e.* FROM assigned_exercises a JOIN exercises e ON e.id=a.exercise_id
               WHERE a.child_id=? AND a.status='assigned' AND e.is_active=1 ORDER BY a.id LIMIT 2""",
            (child_id,),
        ).fetchall()
        all_exercises = db.execute("SELECT * FROM exercises WHERE is_active=1 AND module<>'motor' ORDER BY difficulty,id").fetchall()
    # Keep transitions low: each exercise is a complete activity, not a single tap.
    target_count = {3: 2, 5: 3, 10: 5}[minutes]
    selected: list[dict] = []
    seen: set[int] = set()
    # Обязательные назначения специалиста всегда идут первыми и не фильтруются по модулю.
    for row in assigned:
        item = dict(row)
        if item["id"] in seen:
            continue
        selected.append(item)
        seen.add(item["id"])
        if len(selected) == target_count:
            break
    candidates = [dict(row) for row in all_exercises if row["id"] not in seen]
    while candidates and len(selected) < target_count:
        module_counts = {name: sum(1 for item in selected if item["module"] == name) for name in ("motor", "sensory", "mixed")}
        candidates.sort(key=lambda item: (module_counts[item["module"]], item["difficulty"], item["id"]))
        item = candidates.pop(0)
        selected.append(item)
        seen.add(item["id"])
    return {"child": child, "focus_skill": None, "selection_method": "specialist_assignments_then_safe_variety", "estimated_minutes": minutes, "exercises": selected}


@app.post("/api/learning-sessions", status_code=201)
def create_learning_session(payload: LearningSessionCreate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    with connect() as db:
        existing = db.execute(
            "SELECT id FROM learning_sessions WHERE child_id=? AND status IN ('in_progress','paused') ORDER BY id DESC LIMIT 1",
            (payload.child_id,),
        ).fetchone()
    if existing:
        return get_learning_session(existing["id"], user)
    unique_ids = list(dict.fromkeys(payload.exercise_ids))
    if len(unique_ids) != len(payload.exercise_ids):
        raise HTTPException(422, "В занятии не должно быть повторяющихся заданий")
    placeholders = ",".join("?" for _ in unique_ids)
    with connect() as db:
        exercises = db.execute(f"SELECT * FROM exercises WHERE is_active=1 AND id IN ({placeholders})", tuple(unique_ids)).fetchall()
        if len(exercises) != len(unique_ids):
            raise HTTPException(422, "Одно из заданий недоступно")
        for exercise in exercises:
            ensure_motor_assignment(db, payload.child_id, exercise)
        cursor = db.execute(
            "INSERT INTO learning_sessions(child_id,status,exercise_ids,current_index,target_minutes,started_at) VALUES(?,'in_progress',?,0,?,?) RETURNING id",
            (payload.child_id, json.dumps(unique_ids), payload.target_minutes, now_iso()),
        )
        session_id = cursor.fetchone()["id"]
    by_id = {row["id"]: dict(row) for row in exercises}
    return {"id": session_id, "child_id": payload.child_id, "status": "in_progress", "current_index": 0, "target_minutes": payload.target_minutes, "started_at": now_iso(), "exercises": [by_id[item_id] for item_id in unique_ids]}


@app.patch("/api/learning-sessions/{session_id}/pause")
def pause_learning_session(session_id: int, user: dict = Depends(get_current_user)) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM learning_sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Занятие не найдено")
        ensure_child_access(row["child_id"], user)
        ensure_privacy_consent(row["child_id"])
        next_status = "in_progress" if row["status"] == "paused" else "paused"
        db.execute("UPDATE learning_sessions SET status=?,paused_at=? WHERE id=?", (next_status, None if next_status == "in_progress" else now_iso(), session_id))
    return {"id": session_id, "status": next_status}


@app.get("/api/learning-sessions/{session_id}")
def get_learning_session(session_id: int, user: dict = Depends(get_current_user)) -> dict:
    with connect() as db:
        session = db.execute("SELECT * FROM learning_sessions WHERE id=?", (session_id,)).fetchone()
        if not session:
            raise HTTPException(404, "Занятие не найдено")
        ensure_child_access(session["child_id"], user)
        exercise_ids = json.loads(session["exercise_ids"])
        placeholders = ",".join("?" for _ in exercise_ids)
        exercise_rows = db.execute(f"SELECT * FROM exercises WHERE id IN ({placeholders})", tuple(exercise_ids)).fetchall()
        result_rows = db.execute("SELECT exercise_id,score,duration_seconds,attempts_count,correct_answers,prompts_used,attempt_status,created_at FROM sessions WHERE learning_session_id=? AND measurement_version>=1 ORDER BY sequence_index,id", (session_id,)).fetchall()
    by_id = {row["id"]: dict(row) for row in exercise_rows}
    return {**dict(session), "exercise_ids": exercise_ids, "exercises": [by_id[item_id] for item_id in exercise_ids if item_id in by_id], "results": [dict(row) for row in result_rows]}


@app.get("/api/children/{child_id}/active-session")
def get_active_learning_session(child_id: int, user: dict = Depends(get_current_user)) -> dict | None:
    ensure_child_access(child_id, user)
    with connect() as db:
        row = db.execute(
            "SELECT id FROM learning_sessions WHERE child_id=? AND status IN ('in_progress','paused') ORDER BY id DESC LIMIT 1",
            (child_id,),
        ).fetchone()
    if not row:
        return None
    session = get_learning_session(row["id"], user)
    desired_count = {3: 2, 5: 3, 10: 5}.get(session["target_minutes"], 3)
    current_ids = list(session["exercise_ids"])
    if len(current_ids) < desired_count:
        placeholders = ",".join("?" for _ in current_ids)
        exclusion = f"AND id NOT IN ({placeholders})" if current_ids else ""
        with connect() as db:
            candidates = db.execute(
                f"SELECT id,module FROM exercises WHERE is_active=1 AND module<>'motor' {exclusion} ORDER BY difficulty,id",
                tuple(current_ids),
            ).fetchall()
            while candidates and len(current_ids) < desired_count:
                module_counts = {name: sum(1 for exercise in session["exercises"] if exercise["module"] == name) for name in ("motor", "sensory", "mixed")}
                candidates.sort(key=lambda item: (module_counts[item["module"]], item["id"]))
                chosen = candidates.pop(0)
                current_ids.append(chosen["id"])
                session["exercises"].append({"module": chosen["module"]})
            db.execute("UPDATE learning_sessions SET exercise_ids=? WHERE id=?", (json.dumps(current_ids), row["id"]))
        session = get_learning_session(row["id"], user)
    return session


@app.get("/api/ai/recommendations/{child_id}")
def recommendations(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(child_id, user)
    ensure_analytics_consent(child_id)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confidence": None,
        "insufficient_data": True,
        "suggested_skill": None,
        "suggested_exercise": None,
        "summary": "Автоматические клинические рекомендации отключены. Игровые результаты и участие доступны специалисту только как описательная история.",
        "plan": ["Просмотреть контекст попыток", "Согласовать функциональную цель с семьёй", "Назначить подходящее упражнение вручную"],
        "disclaimer": "Выбор целей и упражнений выполняет квалифицированный специалист.",
    }


@app.post("/api/ai/recommendations/{child_id}/generate", status_code=201)
def generate_recommendation(child_id: int, user: dict = Depends(require_roles("specialist"))) -> dict:
    ensure_child_access(child_id, user)
    ensure_analytics_consent(child_id)
    return recommendations(child_id, user)


@app.get("/api/specialist/children/{child_id}")
def specialist_child(child_id: int, user: dict = Depends(require_roles("specialist"))) -> dict:
    dashboard_data = dashboard(child_id, user)
    progress_details = progress_data(child_id, user)
    with connect() as db:
        assigned = db.execute(
            """SELECT a.*,e.title,e.module,e.skill FROM assigned_exercises a JOIN exercises e ON e.id=a.exercise_id
               WHERE a.child_id=? AND a.specialist_id=? ORDER BY a.id DESC""", (child_id, user["id"]),
        ).fetchall()
        reviews = db.execute(
            """SELECT r.*,e.title exercise_title FROM specialist_recommendations r LEFT JOIN exercises e ON e.id=r.exercise_id
               WHERE r.child_id=? AND r.specialist_id=? ORDER BY r.id DESC LIMIT 10""", (child_id, user["id"]),
        ).fetchall()
        goals = db.execute("SELECT * FROM child_goals WHERE child_id=? ORDER BY position,id", (child_id,)).fetchall()
        homework = db.execute("SELECT * FROM homework_assignments WHERE child_id=? ORDER BY id DESC LIMIT 20", (child_id,)).fetchall()
    goal_items = []
    for row in goals:
        item = dict(row); item["exercise_ids"] = json.loads(item["exercise_ids"]); goal_items.append(item)
    return {"dashboard": dashboard_data, "support_metrics": progress_details["support_metrics"], "assigned_exercises": [dict(row) for row in assigned], "recommendations": [dict(row) for row in reviews], "goals": goal_items, "homework": [dict(row) for row in homework]}


@app.post("/api/specialist/assigned-exercises", status_code=201)
def assign_exercise(payload: AssignedExerciseCreate, user: dict = Depends(require_roles("specialist"))) -> dict:
    ensure_child_access(payload.child_id, user)
    with connect() as db:
        exercise = db.execute("SELECT id FROM exercises WHERE id=? AND is_active=1", (payload.exercise_id,)).fetchone()
        if not exercise:
            raise HTTPException(404, "Упражнение не найдено")
        cursor = db.execute(
            "INSERT INTO assigned_exercises(child_id,specialist_id,exercise_id,note,status,created_at) VALUES(?,?,?,?,'assigned',?) RETURNING id",
            (payload.child_id, user["id"], payload.exercise_id, payload.note, now_iso()),
        )
        row = db.execute("SELECT * FROM assigned_exercises WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    return dict(row)


@app.post("/api/specialist/recommendations", status_code=201)
def create_specialist_recommendation(payload: SpecialistRecommendationCreate, user: dict = Depends(require_roles("specialist"))) -> dict:
    ensure_child_access(payload.child_id, user)
    with connect() as db:
        if payload.exercise_id and not db.execute("SELECT 1 FROM exercises WHERE id=? AND is_active=1", (payload.exercise_id,)).fetchone():
            raise HTTPException(404, "Упражнение не найдено")
        cursor = db.execute(
            """INSERT INTO specialist_recommendations(child_id,specialist_id,suggested_skill,exercise_id,source,status,comment,created_at)
               VALUES(?,?,?,?,?,'approved',?,?) RETURNING id""",
            (payload.child_id, user["id"], payload.suggested_skill, payload.exercise_id, "specialist", payload.comment, now_iso()),
        )
        row = db.execute("SELECT * FROM specialist_recommendations WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
        if payload.exercise_id:
            db.execute(
                "INSERT INTO assigned_exercises(child_id,specialist_id,exercise_id,note,status,created_at) VALUES(?,?,?,?,'assigned',?)",
                (payload.child_id, user["id"], payload.exercise_id, payload.comment, now_iso()),
            )
    return dict(row)


@app.get("/api/goals/{child_id}")
def list_goals(child_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute(
            """SELECT g.*,u.full_name specialist_name FROM child_goals g
               JOIN users u ON u.id=g.specialist_id WHERE g.child_id=?
               ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,g.position,g.id""",
            (child_id,),
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["exercise_ids"] = json.loads(item["exercise_ids"])
        result.append(item)
    return result


@app.post("/api/specialist/goals", status_code=201)
def create_goal(payload: ChildGoalCreate, user: dict = Depends(require_roles("specialist"))) -> dict:
    ensure_child_access(payload.child_id, user)
    if payload.due_date:
        try:
            date.fromisoformat(payload.due_date)
        except ValueError:
            raise HTTPException(422, "Срок должен быть в формате YYYY-MM-DD")
    with connect() as db:
        if payload.exercise_ids:
            placeholders = ",".join("?" for _ in payload.exercise_ids)
            count = db.execute(f"SELECT COUNT(*) count FROM exercises WHERE id IN ({placeholders}) AND is_active=1", tuple(payload.exercise_ids)).fetchone()["count"]
            if count != len(set(payload.exercise_ids)):
                raise HTTPException(422, "Одно из обязательных упражнений недоступно")
        stamp = now_iso()
        cursor = db.execute(
            """INSERT INTO child_goals(child_id,specialist_id,title,target_skill,due_date,success_criterion,difficulty,exercise_ids,position,status,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,'active',?,?) RETURNING id""",
            (payload.child_id, user["id"], payload.title, payload.target_skill, payload.due_date,
             payload.success_criterion, payload.difficulty, json.dumps(payload.exercise_ids), payload.position, stamp, stamp),
        )
        goal_id = cursor.fetchone()["id"]
        for exercise_id in payload.exercise_ids:
            db.execute(
                "INSERT INTO assigned_exercises(child_id,specialist_id,exercise_id,note,status,created_at) VALUES(?,?,?,?,'assigned',?)",
                (payload.child_id, user["id"], exercise_id, f"Обязательное упражнение для цели «{payload.title}»", stamp),
            )
        row = db.execute("SELECT * FROM child_goals WHERE id=?", (goal_id,)).fetchone()
    audit(user, "goal.create", "child_goal", goal_id, {"child_id": payload.child_id})
    result = dict(row)
    result["exercise_ids"] = json.loads(result["exercise_ids"])
    return result


@app.patch("/api/specialist/goals/{goal_id}")
def update_goal_status(goal_id: int, payload: GoalStatusUpdate, user: dict = Depends(require_roles("specialist"))) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM child_goals WHERE id=? AND specialist_id=?", (goal_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Цель не найдена")
        ensure_child_access(row["child_id"], user)
        db.execute("UPDATE child_goals SET status=?,updated_at=? WHERE id=?", (payload.status, now_iso(), goal_id))
        updated = db.execute("SELECT * FROM child_goals WHERE id=?", (goal_id,)).fetchone()
    audit(user, "goal.status", "child_goal", goal_id, {"status": payload.status})
    result = dict(updated)
    result["exercise_ids"] = json.loads(result["exercise_ids"])
    return result


@app.get("/api/homework/{child_id}")
def list_homework(child_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT * FROM homework_assignments WHERE child_id=? ORDER BY id DESC LIMIT 30", (child_id,)).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/specialist/homework", status_code=201)
def create_homework(payload: HomeworkCreate, user: dict = Depends(require_roles("specialist"))) -> dict:
    ensure_child_access(payload.child_id, user)
    with connect() as db:
        if payload.goal_id and not db.execute("SELECT 1 FROM child_goals WHERE id=? AND child_id=? AND specialist_id=?", (payload.goal_id, payload.child_id, user["id"])).fetchone():
            raise HTTPException(422, "Цель не найдена")
        cursor = db.execute(
            "INSERT INTO homework_assignments(child_id,specialist_id,goal_id,title,instruction,due_date,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id",
            (payload.child_id, user["id"], payload.goal_id, payload.title, payload.instruction, payload.due_date, now_iso()),
        )
        homework_id = cursor.fetchone()["id"]
        row = db.execute("SELECT * FROM homework_assignments WHERE id=?", (homework_id,)).fetchone()
    audit(user, "homework.create", "homework", homework_id, {"child_id": payload.child_id})
    return dict(row)


@app.patch("/api/homework/{homework_id}/result")
def save_homework_result(homework_id: int, payload: HomeworkResultUpdate, user: dict = Depends(require_roles("parent"))) -> dict:
    with connect() as db:
        row = db.execute("SELECT h.* FROM homework_assignments h JOIN children c ON c.id=h.child_id WHERE h.id=? AND c.parent_id=?", (homework_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Домашнее задание не найдено")
        ensure_privacy_consent(row["child_id"])
        db.execute("UPDATE homework_assignments SET result=?,parent_note=?,completed_at=? WHERE id=?", (payload.result, payload.parent_note, now_iso(), homework_id))
        updated = db.execute("SELECT * FROM homework_assignments WHERE id=?", (homework_id,)).fetchone()
    audit(user, "homework.result", "homework", homework_id, {"result": payload.result})
    return dict(updated)


@app.get("/api/children/{child_id}/consent")
def get_consent(child_id: int, user: dict = Depends(require_roles("parent", "student"))) -> dict:
    ensure_child_access(child_id, user)
    return consent_record(child_id)


@app.put("/api/children/{child_id}/consent")
def update_consent(child_id: int, payload: ConsentUpdate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    if not payload.privacy_accepted and (payload.camera_processing or payload.specialist_sharing or payload.analytics_processing):
        raise HTTPException(422, "Дополнительные разрешения можно включить только после принятия обязательных условий")
    previous = consent_record(child_id)
    stamp = now_iso()
    accepted_at = lambda key, enabled: (previous.get(f"{key}_at") or stamp) if enabled else None
    with connect() as db:
        db.execute(
            """INSERT INTO child_consents(
                   child_id,parent_id,privacy_accepted,camera_processing,specialist_sharing,analytics_processing,
                   consented_by_user_id,privacy_accepted_at,camera_processing_at,specialist_sharing_at,
                   analytics_processing_at,version,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(child_id) DO UPDATE SET
                   parent_id=excluded.parent_id,privacy_accepted=excluded.privacy_accepted,
                   camera_processing=excluded.camera_processing,specialist_sharing=excluded.specialist_sharing,
                   analytics_processing=excluded.analytics_processing,consented_by_user_id=excluded.consented_by_user_id,
                   privacy_accepted_at=excluded.privacy_accepted_at,camera_processing_at=excluded.camera_processing_at,
                   specialist_sharing_at=excluded.specialist_sharing_at,
                   analytics_processing_at=excluded.analytics_processing_at,
                   version=excluded.version,updated_at=excluded.updated_at""",
            (
                child_id, user["id"], int(payload.privacy_accepted), int(payload.camera_processing),
                int(payload.specialist_sharing), int(payload.analytics_processing), user["id"],
                accepted_at("privacy_accepted", payload.privacy_accepted),
                accepted_at("camera_processing", payload.camera_processing),
                accepted_at("specialist_sharing", payload.specialist_sharing),
                accepted_at("analytics_processing", payload.analytics_processing),
                CONSENT_VERSION, stamp,
            ),
        )
    audit(user, "consent.update", "child", child_id, {
        "privacy": payload.privacy_accepted,
        "camera": payload.camera_processing,
        "sharing": payload.specialist_sharing,
        "analytics": payload.analytics_processing,
        "version": CONSENT_VERSION,
    })
    return get_consent(child_id, user)


@app.get("/api/children/{child_id}/export")
def export_child_data(child_id: int, user: dict = Depends(require_roles("parent"))) -> Response:
    child = ensure_child_access(child_id, user)
    with connect() as db:
        student = db.execute("SELECT id,username,is_active,created_at FROM student_accounts WHERE child_id=?", (child_id,)).fetchone()
        session_rows = [dict(row) for row in db.execute("SELECT * FROM sessions WHERE child_id=? ORDER BY id", (child_id,)).fetchall()]
        for row in session_rows:
            row["details"] = json.loads(row.get("details") or "{}")
        learning_rows = [dict(row) for row in db.execute("SELECT * FROM learning_sessions WHERE child_id=? ORDER BY id", (child_id,)).fetchall()]
        for row in learning_rows:
            row["exercise_ids"] = json.loads(row.get("exercise_ids") or "[]")
        goal_rows = [dict(row) for row in db.execute("SELECT * FROM child_goals WHERE child_id=? ORDER BY id", (child_id,)).fetchall()]
        for row in goal_rows:
            row["exercise_ids"] = json.loads(row.get("exercise_ids") or "[]")
        history_rows = [dict(row) for row in db.execute("SELECT * FROM aac_phrase_history WHERE child_id=? ORDER BY id", (child_id,)).fetchall()]
        for row in history_rows:
            row["card_ids"] = json.loads(row.get("card_ids") or "[]")
        audit_rows = [dict(row) for row in db.execute("SELECT * FROM audit_events WHERE object_type='child' AND object_id=? ORDER BY id", (str(child_id),)).fetchall()]
        for row in audit_rows:
            row["metadata"] = json.loads(row.get("metadata") or "{}")
        setting_keys = [f"user:{user['id']}"] + ([f"student:{student['id']}"] if student else [])
        setting_placeholders = ",".join("?" for _ in setting_keys)
        payload = {
            "exported_at": now_iso(),
            "export_scope": "Все хранимые данные профиля ребёнка; хэши паролей и PIN не включаются.",
            "child": child,
            "consent": dict(db.execute("SELECT * FROM child_consents WHERE child_id=?", (child_id,)).fetchone() or {}),
            "student_account": dict(student) if student else None,
            "settings": [dict(row) for row in db.execute(f"SELECT * FROM user_settings WHERE user_key IN ({setting_placeholders}) ORDER BY user_key", tuple(setting_keys)).fetchall()],
            "sessions": session_rows,
            "learning_sessions": learning_rows,
            "assigned_exercises": [dict(row) for row in db.execute("SELECT * FROM assigned_exercises WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "specialist_access": [dict(row) for row in db.execute("SELECT * FROM specialist_children WHERE child_id=? ORDER BY assigned_at", (child_id,)).fetchall()],
            "specialist_recommendations": [dict(row) for row in db.execute("SELECT * FROM specialist_recommendations WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "goals": goal_rows,
            "homework": [dict(row) for row in db.execute("SELECT * FROM homework_assignments WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "aac_custom_cards": [dict(row) for row in db.execute("SELECT * FROM aac_cards WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "aac_favorites": [dict(row) for row in db.execute("SELECT * FROM aac_favorites WHERE child_id=? ORDER BY card_id", (child_id,)).fetchall()],
            "aac_history": history_rows,
            "notifications": [dict(row) for row in db.execute("SELECT * FROM notifications WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "audit_events": audit_rows,
        }
    audit(user, "child.export", "child", child_id)
    return Response(content=json.dumps(payload, ensure_ascii=False, indent=2), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="soyle-child-{child_id}.json"'})


@app.delete("/api/children/{child_id}", status_code=204)
def delete_child_data(child_id: int, payload: ChildDeleteRequest, user: dict = Depends(require_roles("parent"))):
    ensure_child_access(child_id, user)
    with connect() as db:
        account = db.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
        if not account or not verify_password(payload.password, account["password_hash"]):
            raise HTTPException(403, "Пароль не подтверждён")
        db.execute("DELETE FROM children WHERE id=? AND parent_id=?", (child_id, user["id"]))
    audit(user, "child.delete", "child", child_id)


@app.patch("/api/specialist/recommendations/{recommendation_id}")
def review_recommendation(recommendation_id: int, payload: RecommendationReview, user: dict = Depends(require_roles("specialist"))) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM specialist_recommendations WHERE id=? AND specialist_id=?", (recommendation_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Рекомендация не найдена")
        db.execute("UPDATE specialist_recommendations SET status=?,comment=?,reviewed_at=? WHERE id=?", (payload.status, payload.comment or row["comment"], now_iso(), recommendation_id))
        if payload.status in {"approved", "edited"} and row["exercise_id"]:
            db.execute(
                "INSERT INTO assigned_exercises(child_id,specialist_id,exercise_id,note,status,created_at) VALUES(?,?,?,?,'assigned',?)",
                (row["child_id"], user["id"], row["exercise_id"], payload.comment or row["comment"], now_iso()),
            )
        updated = db.execute("SELECT * FROM specialist_recommendations WHERE id=?", (recommendation_id,)).fetchone()
    return dict(updated)


@app.get("/api/admin/specialist-assignments")
def specialist_assignments(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            """SELECT sc.specialist_id,sc.child_id,sc.assigned_at,u.full_name specialist_name,c.name child_name
               FROM specialist_children sc JOIN users u ON u.id=sc.specialist_id
               JOIN children c ON c.id=sc.child_id ORDER BY sc.assigned_at DESC"""
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/admin/specialist-assignments", status_code=201)
def create_specialist_assignment(payload: SpecialistAssignmentCreate, admin: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        specialist = db.execute("SELECT id FROM users WHERE id=? AND role='specialist' AND is_active=1", (payload.specialist_id,)).fetchone()
        child = db.execute("SELECT id FROM children WHERE id=?", (payload.child_id,)).fetchone()
        if not specialist or not child:
            raise HTTPException(422, "Проверьте специалиста и профиль ребёнка")
        consent = db.execute(
            "SELECT privacy_accepted,specialist_sharing FROM child_consents WHERE child_id=?",
            (payload.child_id,),
        ).fetchone()
        if not consent or not consent["privacy_accepted"] or not consent["specialist_sharing"]:
            raise HTTPException(409, "Родитель ещё не разрешил передачу данных специалисту")
        db.execute(
            "INSERT INTO specialist_children(specialist_id,child_id,assigned_at) VALUES(?,?,?) ON CONFLICT(specialist_id,child_id) DO NOTHING",
            (payload.specialist_id, payload.child_id, now_iso()),
        )
        row = db.execute("SELECT * FROM specialist_children WHERE specialist_id=? AND child_id=?", (payload.specialist_id, payload.child_id)).fetchone()
    audit(admin, "specialist.assign", "child", payload.child_id, {"specialist_id": payload.specialist_id})
    return dict(row)


@app.delete("/api/admin/specialist-assignments/{specialist_id}/{child_id}", status_code=204)
def delete_specialist_assignment(specialist_id: int, child_id: int, admin: dict = Depends(require_roles("admin"))):
    with connect() as db:
        db.execute("DELETE FROM specialist_children WHERE specialist_id=? AND child_id=?", (specialist_id, child_id))
    audit(admin, "specialist.unassign", "child", child_id, {"specialist_id": specialist_id})


@app.get("/api/admin/stats")
def admin_stats(_: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        return {
            "users": db.execute("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM student_accounts) count").fetchone()["count"],
            "children": db.execute("SELECT COUNT(*) count FROM children").fetchone()["count"],
            "sessions": db.execute("SELECT COUNT(*) count FROM sessions WHERE measurement_version>=1").fetchone()["count"],
            "exercises": db.execute("SELECT COUNT(*) count FROM exercises WHERE is_active=1").fetchone()["count"],
        }


@app.get("/api/admin/users")
def admin_users(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        return [public_user(row) for row in db.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()]


@app.get("/api/admin/students")
def admin_students(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        rows = db.execute("SELECT s.id,s.username,s.is_active,s.created_at,s.child_id,c.name child_name,u.full_name parent_name FROM student_accounts s JOIN children c ON c.id=s.child_id JOIN users u ON u.id=c.parent_id ORDER BY s.created_at DESC").fetchall()
    return [dict(row) for row in rows]


@app.get("/api/admin/usage")
def admin_usage(days: int = Query(default=30, ge=1, le=365), _: dict = Depends(require_roles("admin"))) -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with connect() as db:
        totals = db.execute("SELECT COUNT(*) requests,COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(estimated_cost_usd),0) cost FROM usage_events WHERE created_at >= ?", (cutoff,)).fetchone()
        breakdown = db.execute("SELECT provider,model,feature,COUNT(*) requests,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(estimated_cost_usd) cost FROM usage_events WHERE created_at >= ? GROUP BY provider,model,feature ORDER BY requests DESC", (cutoff,)).fetchall()
        recent = db.execute("SELECT provider,model,feature,input_tokens,output_tokens,estimated_cost_usd,created_at FROM usage_events ORDER BY id DESC LIMIT 20").fetchall()
    return {"period_days": days, "requests": totals["requests"], "input_tokens": totals["input_tokens"], "output_tokens": totals["output_tokens"], "total_tokens": totals["input_tokens"] + totals["output_tokens"], "estimated_cost_usd": round(totals["cost"], 6), "breakdown": [dict(row) for row in breakdown], "recent": [dict(row) for row in recent], "note": "Камера работает только как локальное зеркало и не расходует токены. Стоимость облачных моделей будет рассчитана при их подключении."}


@app.get("/api/admin/audit")
def admin_audit(limit: int = Query(default=100, ge=1, le=500), _: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        rows = db.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{**dict(row), "metadata": json.loads(row["metadata"])} for row in rows]


@app.patch("/api/admin/users/{user_id}/role")
def update_role(user_id: int, payload: RoleUpdate, admin: dict = Depends(require_roles("admin"))) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(400, "Нельзя изменить собственную роль")
    with connect() as db:
        db.execute("UPDATE users SET role=? WHERE id=?", (payload.role, user_id))
        row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Пользователь не найден")
    audit(admin, "user.role", "user", user_id, {"role": payload.role})
    return public_user(row)


@app.patch("/api/admin/users/{user_id}/active")
def update_active(user_id: int, payload: ActiveUpdate, admin: dict = Depends(require_roles("admin"))) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(400, "Нельзя отключить собственный аккаунт")
    with connect() as db:
        db.execute("UPDATE users SET is_active=? WHERE id=?", (int(payload.is_active), user_id))
        row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Пользователь не найден")
    audit(admin, "user.active", "user", user_id, {"active": payload.is_active})
    return public_user(row)


@app.post("/api/admin/exercises", status_code=201)
def create_exercise(payload: ExerciseCreate, _: dict = Depends(require_roles("admin"))) -> dict:
    skill = payload.skill or {"motor": "articulation", "sensory": "vocabulary", "mixed": "phrase_building"}[payload.module]
    with connect() as db:
        cursor = db.execute("INSERT INTO exercises(module,title,instruction,difficulty,target,icon,skill,is_active) VALUES(?,?,?,?,?,?,?,?) RETURNING id", (payload.module, payload.title, payload.instruction, payload.difficulty, payload.target, payload.icon, skill, int(payload.is_active)))
        row = db.execute("SELECT * FROM exercises WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    return dict(row)


@app.put("/api/admin/exercises/{exercise_id}")
def update_exercise(exercise_id: int, payload: ExerciseCreate, _: dict = Depends(require_roles("admin"))) -> dict:
    skill = payload.skill or {"motor": "articulation", "sensory": "vocabulary", "mixed": "phrase_building"}[payload.module]
    with connect() as db:
        db.execute("UPDATE exercises SET module=?,title=?,instruction=?,difficulty=?,target=?,icon=?,skill=?,is_active=? WHERE id=?", (payload.module, payload.title, payload.instruction, payload.difficulty, payload.target, payload.icon, skill, int(payload.is_active), exercise_id))
        row = db.execute("SELECT * FROM exercises WHERE id=?", (exercise_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Упражнение не найдено")
    return dict(row)


@app.delete("/api/admin/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, _: dict = Depends(require_roles("admin"))):
    with connect() as db:
        db.execute("UPDATE exercises SET is_active=0 WHERE id=?", (exercise_id,))

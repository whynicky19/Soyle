import json
import base64
import binascii
import os
import hashlib
import secrets
import shutil
import subprocess
import tempfile
import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .database import connect, init_db, now_iso
from .schemas import AACCardCreate, AACComposeRequest, AACFavoriteUpdate, AACPhraseCreate, ActiveUpdate, AdaptivePlanRequest, AIAskRequest, AIPlanRequest, AssignedExerciseCreate, ChildCreate, ChildDeleteRequest, ChildGoalCreate, ConsentUpdate, ContentReviewCreate, ExerciseDraftCreate, GoalStatusUpdate, HomeActivityObservationCreate, HomeworkCreate, HomeworkResultUpdate, LearningSessionCreate, LoginRequest, PracticeGoalCreate, PracticeGoalObservationCreate, PracticeGoalUpdate, PracticePreferencesUpdate, RecommendationReview, RegisterRequest, RoleUpdate, SessionCreate, SkillObservationUpdate, SpecialistAssignmentCreate, SpecialistRecommendationCreate, StoryAnswer, StudentAccountCreate, StudentLoginRequest, TTSRequest, UserSettingsUpdate, WorldPhotoCreate, WorldPhotoRename, StorybookEvent
from .tts_library import bundled_tts_path
from .aac_grammar import compose_aac_phrase
from .ai_assistant import DISCLAIMER as LOCAL_ASSISTANT_DISCLAIMER, answer_parent
from .exercise_engine import create_draft, preview_version, publish_version, published_exercise, published_exercise_rows, review_capabilities, review_workspace, submit_content_review
from .family_practice import descriptive_results, home_library, save_home_observation, skill_map, upsert_skill_observation
from .adaptive_planner import create_plan as create_adaptive_plan, get_plan as get_adaptive_plan, plan_history as adaptive_plan_history
from .practice_goals import create_goal as create_practice_goal, get_preferences, list_goals as list_practice_goals, list_templates as list_practice_goal_templates, save_observation as save_practice_goal_observation, save_preferences, update_goal as update_practice_goal
from .migrations import LATEST_SCHEMA_VERSION
from .stories import STORIES, public_story
from .schemas import CinematicStorybookEvent
from .interactive_storybook import STORY as INTERACTIVE_BOOK, initial_state as book_initial_state, transition as book_transition
from .cinematic_storybook import DEFINITION as CINEMATIC_STORY, initial_state as cinematic_initial_state, transition as cinematic_transition
from .storybook_content import FAVORITE_TOY
from .storybook_engine import initial_state as storybook_initial_state, transition as storybook_transition
from .security import AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, IS_PRODUCTION, clear_auth_cookies, create_access_token, create_student_access_token, get_current_user, hash_password, require_roles, set_auth_cookies, verify_password


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with connect() as db:
        schema_version = db.execute("SELECT COALESCE(MAX(version),0) schema_version FROM schema_migrations").fetchone()["schema_version"]
    if schema_version < LATEST_SCHEMA_VERSION:
        logging.getLogger("soyle.startup").error(
            "Database schema is not ready: current=%s required=%s. Run the controlled pre-deploy migration.",
            schema_version,
            LATEST_SCHEMA_VERSION,
        )
    yield


app = FastAPI(title="Söyle API", version="1.0.0", lifespan=lifespan)
CONSENT_VERSION = "2026-10-local-face-1"
LOCAL_MIRROR_TARGETS = frozenset({"smile", "tube", "open", "teeth", "cheeks", "sequence"})
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
    {"id": "intro", "label": "Важные сообщения", "title": "Я могу сообщить о важном", "targets": ["help", "desire", "need", "refusal", "choice"]},
    {"id": "food", "label": "Тема 1", "title": "Еда и продукты", "targets": ["food", "request", "preference"]},
    {"id": "home", "label": "Тема 2", "title": "Я и мой дом", "targets": ["family", "observation", "animals", "body", "clothes", "household"]},
    {"id": "play", "label": "Тема 3", "title": "Игра и пространство", "targets": ["toys", "qualities", "opposites", "location", "spatial_phrase"]},
    {"id": "actions", "label": "Тема 4", "title": "Действия и мой день", "targets": ["actions", "commands", "agent_action", "routine", "past_event"]},
    {"id": "feelings", "label": "Тема 5", "title": "Диалог и состояние", "targets": ["feelings", "greeting", "answer", "question", "places"]},
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
    if user["role"] not in {"admin", "parent", "student"}:
        raise HTTPException(403, "Для этой роли доступ к профилю ребёнка не настроен")
    if user["role"] == "parent" and child["parent_id"] != user["id"]:
        raise HTTPException(403, "Нет доступа к профилю ребёнка")
    if user["role"] == "student" and child["id"] != user["child_id"]:
        raise HTTPException(403, "Нет доступа к профилю ребёнка")
    return dict(child)


def consent_record(child_id: int) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM child_consents WHERE child_id=?", (child_id,)).fetchone()
    if not row:
        return {
            "child_id": child_id,
            "privacy_accepted": False,
            "camera_processing": False,
            "ai_processing": False,
            "analytics_processing": False,
            "version": CONSENT_VERSION,
            "updated_at": None,
            "consented_by_user_id": None,
            "privacy_accepted_at": None,
            "camera_processing_at": None,
            "ai_processing_at": None,
            "analytics_processing_at": None,
        }
    camera_consent_is_current = row["version"] == CONSENT_VERSION
    return {
        "child_id": row["child_id"],
        "privacy_accepted": bool(row["privacy_accepted"]),
        "camera_processing": bool(row["camera_processing"]) and camera_consent_is_current,
        "ai_processing": bool(row["ai_processing"]),
        "analytics_processing": bool(row["analytics_processing"]),
        "version": row["version"],
        "updated_at": row["updated_at"],
        "consented_by_user_id": row["consented_by_user_id"],
        "privacy_accepted_at": row["privacy_accepted_at"],
        "camera_processing_at": row["camera_processing_at"] if camera_consent_is_current else None,
        "ai_processing_at": row["ai_processing_at"],
        "analytics_processing_at": row["analytics_processing_at"],
    }


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


def ensure_camera_processing_consent(child_id: int) -> dict:
    consent = ensure_privacy_consent(child_id)
    if not consent["camera_processing"]:
        raise HTTPException(403, "Сначала родителю нужно отдельно разрешить локальную проверку движения камерой")
    return consent


def ensure_local_mirror_exercise(exercise: dict) -> None:
    if exercise["module"] != "motor":
        return
    if exercise["target"] not in LOCAL_MIRROR_TARGETS:
        raise HTTPException(403, "Это движение не входит в проверенную библиотеку локального зеркала")


def active_exercise_rows(db) -> list[dict]:
    return published_exercise_rows(db)


SESSION_COMPLETION_STATUSES = {"completed", "participated", "refused"}


def learning_session_payload(db, session_row) -> dict:
    """Return a resumable view without re-exposing archived exercises.

    Older plans may reference exercises that were archived after the session was
    created. Keep those IDs in storage for audit/history, but build the active
    runner from currently published exercises and put already completed items
    before the first pending item so ``current_index`` remains meaningful.
    """
    session = dict(session_row)
    planned_ids = json.loads(session["exercise_ids"])
    exercise_rows = active_exercise_rows(db)
    by_id = {row["id"]: dict(row) for row in exercise_rows}
    adaptive_by_exercise: dict[int, dict] = {}
    if session.get("adaptive_plan_id"):
        for item_row in db.execute(
            """SELECT i.*,g.title goal_title FROM adaptive_practice_plan_items i
               JOIN parent_practice_goals g ON g.id=i.goal_id
               WHERE i.plan_id=? ORDER BY i.position,i.id""",
            (session["adaptive_plan_id"],),
        ).fetchall():
            item = dict(item_row)
            adaptive_by_exercise[item["exercise_id"]] = {
                "plan_item_id": item["id"],
                "goal_id": item["goal_id"],
                "goal_version": item["goal_version"],
                "goal_title": item["goal_title"],
                "exercise_version_id": item["exercise_version_id"],
                "difficulty_params": json.loads(item["difficulty_params_json"]),
                "assignment_reason": json.loads(item["assignment_reason_json"]),
            }
    available_ids = [exercise_id for exercise_id in planned_ids if exercise_id in by_id]
    result_rows = db.execute(
        """SELECT exercise_id,score,duration_seconds,attempts_count,correct_answers,prompts_used,
                  attempt_status,created_at
           FROM sessions
           WHERE learning_session_id=? AND measurement_version>=1
             AND response_owner='child' AND support_context<>'unknown'
           ORDER BY sequence_index,id""",
        (session["id"],),
    ).fetchall()
    completed_ids = {
        row["exercise_id"]
        for row in result_rows
        if row["attempt_status"] in SESSION_COMPLETION_STATUSES
    }
    completed_available = [exercise_id for exercise_id in available_ids if exercise_id in completed_ids]
    pending_available = [exercise_id for exercise_id in available_ids if exercise_id not in completed_ids]
    runner_ids = completed_available + pending_available
    current_index = len(completed_available)

    if session["status"] in {"in_progress", "paused"}:
        if not pending_available:
            completed_at = session.get("completed_at") or now_iso()
            db.execute(
                "UPDATE learning_sessions SET status='completed',current_index=?,completed_at=? WHERE id=?",
                (current_index, completed_at, session["id"]),
            )
            session["status"] = "completed"
            session["completed_at"] = completed_at
        elif session["current_index"] != current_index:
            db.execute(
                "UPDATE learning_sessions SET current_index=? WHERE id=?",
                (current_index, session["id"]),
            )
        session["current_index"] = current_index

    return {
        **session,
        "exercise_ids": planned_ids,
        "exercises": [
            {**by_id[exercise_id], "adaptive": adaptive_by_exercise.get(exercise_id)}
            for exercise_id in runner_ids
        ],
        "results": [dict(row) for row in result_rows],
    }


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


def enforce_registration_limit(identifiers: tuple[str, str]) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    with connect() as db:
        account_attempts = db.execute(
            "SELECT COUNT(*) count FROM auth_attempts WHERE identifier=? AND attempted_at>=?",
            (identifiers[0], cutoff),
        ).fetchone()["count"]
        client_attempts = db.execute(
            "SELECT COUNT(*) count FROM auth_attempts WHERE identifier=? AND attempted_at>=?",
            (identifiers[1], cutoff),
        ).fetchone()["count"]
    if account_attempts >= 5 or client_attempts >= 30:
        raise HTTPException(429, "Слишком много попыток регистрации. Попробуйте снова через 15 минут")


def record_registration_attempt(identifiers: tuple[str, str]) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    with connect() as db:
        for identifier in identifiers:
            db.execute("INSERT INTO auth_attempts(identifier,successful,attempted_at) VALUES(?,?,?)", (identifier, 1, now_iso()))
        db.execute("DELETE FROM auth_attempts WHERE attempted_at<?", (cutoff,))


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
                AND s.response_owner='child'
                AND s.support_context IN ('independent','caregiver_supported')
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
            f"{unit['label']}: есть попытки по всем заданиям",
            f"{child['name']}: по всем доступным заданиям этой подборки есть сохранённые попытки. Это охват практики, а не оценка развития речи.",
            json.dumps({"unit_id": unit["id"], "unit_label": unit["label"], "unit_title": unit["title"]}, ensure_ascii=False),
            now_iso(),
        ),
    )


@app.get("/health")
@app.get("/health/live")
def liveness() -> dict:
    return {"status": "alive", "service": "soyle-api"}


@app.get("/api/health")
@app.get("/health/ready")
def readiness() -> Response:
    try:
        with connect() as db:
            schema_version = db.execute("SELECT COALESCE(MAX(version),0) schema_version FROM schema_migrations").fetchone()["schema_version"]
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "database_unavailable", "service": "soyle-api", "required_schema_version": LATEST_SCHEMA_VERSION},
        )
    ready = schema_version >= LATEST_SCHEMA_VERSION
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ok" if ready else "migration_required",
            "service": "soyle-api",
            "schema_version": schema_version,
            "required_schema_version": LATEST_SCHEMA_VERSION,
        },
    )


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest, request: Request, response: Response) -> dict:
    identifiers = login_identifiers("register", payload.username, request)
    enforce_registration_limit(identifiers)
    record_registration_attempt(identifiers)
    with connect() as db:
        username = payload.username.lower()
        if db.execute("SELECT 1 FROM users WHERE lower(username)=?", (username,)).fetchone():
            raise HTTPException(409, "Не удалось создать аккаунт с этими данными")
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
    if row["role"] == "specialist":
        record_login_attempt(identifiers, False)
        raise HTTPException(403, "Роль специалиста больше не используется в Söyle")
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
    bundled_path = bundled_tts_path(text, payload.language)
    if bundled_path.exists():
        return FileResponse(
            bundled_path,
            media_type="audio/wav",
            filename="soyle-speech.wav",
            headers={"Cache-Control": "no-store", "X-Soyle-TTS": "bundled"},
        )
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
               AND s.attempt_status IN ('completed','participated')
               AND s.response_owner='child'
               AND s.support_context IN ('independent','caregiver_supported')""",
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
        if child_id is not None:
            ensure_child_access(child_id, user)
        rows = active_exercise_rows(db)
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


@app.get("/api/world/{child_id}")
def world_photos(child_id: int, response: Response, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    response.headers["Cache-Control"] = "private, no-store"
    with connect() as db:
        rows = db.execute(
            "SELECT id,name,category,image_data,created_at FROM child_world_photos WHERE child_id=? ORDER BY id DESC",
            (child_id,),
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/world/{child_id}", status_code=201)
def add_world_photo(child_id: int, payload: WorldPhotoCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    mime, separator, encoded = payload.image_data.partition(",")
    if not separator or mime not in {"data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"}:
        raise HTTPException(422, "Поддерживаются только фотографии JPEG, PNG и WebP")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "Фотография повреждена") from None
    signatures = {"data:image/jpeg;base64": raw.startswith(b"\xff\xd8\xff"), "data:image/png;base64": raw.startswith(b"\x89PNG\r\n\x1a\n"), "data:image/webp;base64": raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"}
    if not signatures[mime] or not 100 <= len(raw) <= 650_000:
        raise HTTPException(422, "Фотография должна быть изображением размером до 650 КБ")
    image_hash = hashlib.sha256(raw).hexdigest()
    with connect() as db:
        count = db.execute("SELECT COUNT(*) count FROM child_world_photos WHERE child_id=?", (child_id,)).fetchone()["count"]
        if count >= 24:
            raise HTTPException(409, "В библиотеке уже 24 фотографии. Удалите ненужную, чтобы добавить новую")
        if db.execute("SELECT 1 FROM child_world_photos WHERE child_id=? AND image_hash=?", (child_id, image_hash)).fetchone():
            raise HTTPException(409, "Эта фотография уже есть в библиотеке")
        cursor = db.execute(
            "INSERT INTO child_world_photos(child_id,name,category,image_data,image_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id",
            (child_id, payload.name.strip(), payload.category, payload.image_data, image_hash, user["id"], now_iso()),
        )
        row = db.execute("SELECT id,name,category,image_data,created_at FROM child_world_photos WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    return dict(row)


@app.patch("/api/world/{child_id}/{photo_id}")
def rename_world_photo(child_id: int, photo_id: int, payload: WorldPhotoRename, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Назовите фотографию")
    with connect() as db:
        row = db.execute(
            "UPDATE child_world_photos SET name=? WHERE child_id=? AND id=? RETURNING id,name,category,image_data,created_at",
            (name, child_id, photo_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Фотография не найдена")
    return dict(row)


@app.delete("/api/world/{child_id}/{photo_id}", status_code=204)
def delete_world_photo(child_id: int, photo_id: int, user: dict = Depends(require_roles("parent"))) -> Response:
    ensure_child_access(child_id, user)
    with connect() as db:
        cursor = db.execute("DELETE FROM child_world_photos WHERE child_id=? AND id=?", (child_id, photo_id))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Фотография не найдена")
    return Response(status_code=204)


@app.get("/api/stories/{child_id}")
def child_stories(child_id: int, response: Response, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    response.headers["Cache-Control"] = "private, no-store"
    with connect() as db:
        rows = db.execute("SELECT story_key,scene_index,completed_at FROM child_story_progress WHERE child_id=?", (child_id,)).fetchall()
    progress = {row["story_key"]: dict(row) for row in rows}
    return [public_story(key, story, progress.get(key)) for key, story in STORIES.items()]


@app.post("/api/stories/{child_id}/{story_key}/answer")
def answer_story(child_id: int, story_key: str, payload: StoryAnswer, user: dict = Depends(require_roles("student"))) -> dict:
    ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    story = STORIES.get(story_key)
    if not story:
        raise HTTPException(404, "История не найдена")
    with connect() as db:
        row = db.execute("SELECT scene_index,completed_at FROM child_story_progress WHERE child_id=? AND story_key=?", (child_id, story_key)).fetchone()
        current_index = row["scene_index"] if row else 0
        if payload.scene_index != current_index or current_index >= len(story["scenes"]):
            raise HTTPException(409, "История изменилась. Откройте её снова")
        scene = story["scenes"][current_index]
        if payload.answer_key not in {choice["key"] for choice in scene["choices"]}:
            raise HTTPException(422, "Такого ответа в этой сцене нет")
        if payload.answer_key != scene["answer"]:
            return {"correct": False, "hint": scene["hint"], "scene_index": current_index, "completed": False}
        next_index = current_index + 1
        completed_at = now_iso() if next_index == len(story["scenes"]) else (row["completed_at"] if row else None)
        db.execute(
            """INSERT INTO child_story_progress(child_id,story_key,scene_index,completed_at,updated_at)
               VALUES(?,?,?,?,?) ON CONFLICT(child_id,story_key) DO UPDATE SET
               scene_index=excluded.scene_index,completed_at=COALESCE(child_story_progress.completed_at,excluded.completed_at),updated_at=excluded.updated_at""",
            (child_id, story_key, next_index, completed_at, now_iso()),
        )
    return {"correct": True, "hint": "", "scene_index": next_index, "completed": next_index == len(story["scenes"])}


@app.post("/api/stories/{child_id}/{story_key}/restart")
def restart_story(child_id: int, story_key: str, user: dict = Depends(require_roles("student"))) -> dict:
    ensure_child_access(child_id, user)
    if story_key not in STORIES:
        raise HTTPException(404, "История не найдена")
    with connect() as db:
        db.execute(
            "UPDATE child_story_progress SET scene_index=0,updated_at=? WHERE child_id=? AND story_key=?",
            (now_iso(), child_id, story_key),
        )
    return {"scene_index": 0}


def storybook_access(child_id: int, user: dict) -> str:
    ensure_child_access(child_id, user)
    if FAVORITE_TOY["status"] != "PUBLISHED" or FAVORITE_TOY["review_status"] != "approved" or any(scene.get("status") != "PUBLISHED" or scene.get("review_status") != "approved" for scene in FAVORITE_TOY["scenes"]):
        if user["role"] != "parent":
            raise HTTPException(403, "История DRAFT доступна только для предпросмотра родителю")
    return f"preview:{user['id']}" if user["role"] == "parent" else "child"


def storybook_snapshot(db, child_id: int, actor: str) -> dict:
    row = db.execute(
        "SELECT revision,state_json FROM storybook_progress WHERE child_id=? AND story_key=? AND story_version=? AND actor_key=?",
        (child_id, FAVORITE_TOY["key"], FAVORITE_TOY["version"], actor),
    ).fetchone()
    return {"definition": FAVORITE_TOY, "revision": row["revision"] if row else 0,
            "state": json.loads(row["state_json"]) if row else storybook_initial_state(), "preview": actor.startswith("preview:")}


@app.get("/api/storybooks/{child_id}/toy")
def get_storybook(child_id: int, response: Response, user: dict = Depends(get_current_user)) -> dict:
    actor = storybook_access(child_id, user)
    response.headers["Cache-Control"] = "private, no-store"
    with connect() as db:
        return storybook_snapshot(db, child_id, actor)


@app.post("/api/storybooks/{child_id}/toy/events")
def storybook_event(child_id: int, payload: StorybookEvent, user: dict = Depends(get_current_user)) -> dict:
    actor = storybook_access(child_id, user)
    if not actor.startswith("preview:"):
        ensure_privacy_consent(child_id)
    if payload.version != FAVORITE_TOY["version"]:
        raise HTTPException(409, "Версия истории изменилась. Откройте историю снова")
    with connect() as db:
        snapshot = storybook_snapshot(db, child_id, actor)
        if snapshot["state"]["last_event_id"] == payload.event_id:
            return snapshot
        if snapshot["revision"] != payload.expected_revision or FAVORITE_TOY["scenes"][snapshot["state"]["scene_index"]]["id"] != payload.scene_id:
            raise HTTPException(409, "Прохождение изменилось в другой вкладке. Откройте историю снова")
        try:
            state = storybook_transition(FAVORITE_TOY, snapshot["state"], payload.action, payload.event_id)
        except ValueError as cause:
            raise HTTPException(422, str(cause)) from None
        changed = db.execute(
            """INSERT INTO storybook_progress(child_id,story_key,story_version,actor_key,revision,state_json,updated_at)
               VALUES(?,?,?,?,?,?,?) ON CONFLICT(child_id,story_key,story_version,actor_key) DO UPDATE SET
               revision=excluded.revision,state_json=excluded.state_json,updated_at=excluded.updated_at
               WHERE storybook_progress.revision=? RETURNING revision""",
            (child_id, "toy", FAVORITE_TOY["version"], actor, payload.expected_revision + 1, json.dumps(state, ensure_ascii=False), now_iso(), payload.expected_revision),
        ).fetchone()
        if not changed:
            raise HTTPException(409, "Прохождение изменилось. Откройте историю снова")
    return {**snapshot, "state": state, "revision": changed["revision"]}



def cinematic_access(child_id: int, user: dict) -> str:
    ensure_child_access(child_id, user)
    if CINEMATIC_STORY["status"] != "PUBLISHED" or CINEMATIC_STORY["review_status"] != "approved" or any(value != "approved" for value in CINEMATIC_STORY["approval"].values()):
        if user["role"] != "parent":
            raise HTTPException(403, "История DRAFT доступна только для предпросмотра родителю")
    return f"preview:{user['id']}" if user["role"] == "parent" else "child"


def cinematic_snapshot(db, child_id: int, actor: str) -> dict:
    row = db.execute(
        "SELECT revision,state_json FROM storybook_progress WHERE child_id=? AND story_key=? AND story_version=? AND actor_key=?",
        (child_id, "toy", CINEMATIC_STORY["version"], actor),
    ).fetchone()
    return {"definition": CINEMATIC_STORY, "revision": row["revision"] if row else 0,
            "state": json.loads(row["state_json"]) if row else cinematic_initial_state(), "preview": actor.startswith("preview:")}


@app.get("/api/cinematic-storybooks/{child_id}/toy")
def get_cinematic_storybook(child_id: int, response: Response, user: dict = Depends(get_current_user)) -> dict:
    actor = cinematic_access(child_id, user)
    response.headers["Cache-Control"] = "private, no-store"
    with connect() as db:
        return cinematic_snapshot(db, child_id, actor)


@app.post("/api/cinematic-storybooks/{child_id}/toy/events")
def cinematic_storybook_event(child_id: int, payload: CinematicStorybookEvent, user: dict = Depends(get_current_user)) -> dict:
    actor = cinematic_access(child_id, user)
    if not actor.startswith("preview:"):
        ensure_privacy_consent(child_id)
    if payload.version != CINEMATIC_STORY["version"]:
        raise HTTPException(409, "Версия истории изменилась. Откройте историю снова")
    with connect() as db:
        snapshot = cinematic_snapshot(db, child_id, actor)
        if any(event["id"] == payload.event_id for event in snapshot["state"]["events"]):
            return snapshot
        if snapshot["revision"] != payload.expected_revision or snapshot["state"]["phase"] != payload.phase:
            raise HTTPException(409, "Прохождение изменилось в другой вкладке. Откройте историю снова")
        try:
            state = cinematic_transition(snapshot["state"], payload.action, payload.event_id)
        except ValueError as cause:
            raise HTTPException(422, str(cause)) from None
        changed = db.execute(
            """INSERT INTO storybook_progress(child_id,story_key,story_version,actor_key,revision,state_json,updated_at)
               VALUES(?,?,?,?,?,?,?) ON CONFLICT(child_id,story_key,story_version,actor_key) DO UPDATE SET
               revision=excluded.revision,state_json=excluded.state_json,updated_at=excluded.updated_at
               WHERE storybook_progress.revision=? RETURNING revision""",
            (child_id, "toy", CINEMATIC_STORY["version"], actor, payload.expected_revision + 1, json.dumps(state, ensure_ascii=False), now_iso(), payload.expected_revision),
        ).fetchone()
        if not changed:
            raise HTTPException(409, "Прохождение изменилось. Откройте историю снова")
    return {**snapshot, "state": state, "revision": changed["revision"]}



def interactive_book_access(child_id: int, user: dict) -> str:
    ensure_child_access(child_id, user)
    if INTERACTIVE_BOOK["status"] != "PUBLISHED" or INTERACTIVE_BOOK["review_status"] != "approved":
        if user["role"] != "parent":
            raise HTTPException(403, "Книга DRAFT доступна только для предпросмотра родителю")
    return f"preview:{user['id']}" if user["role"] == "parent" else "child"


def interactive_book_snapshot(db, child_id: int, actor: str) -> dict:
    row = db.execute("SELECT revision,state_json FROM storybook_progress WHERE child_id=? AND story_key=? AND story_version=? AND actor_key=?", (child_id, "toy", INTERACTIVE_BOOK["version"], actor)).fetchone()
    return {"definition": INTERACTIVE_BOOK, "revision": row["revision"] if row else 0, "state": json.loads(row["state_json"]) if row else book_initial_state(), "preview": actor.startswith("preview:")}


@app.get("/api/interactive-storybooks/{child_id}/toy")
def get_interactive_book(child_id: int, response: Response, user: dict = Depends(get_current_user)) -> dict:
    actor = interactive_book_access(child_id, user)
    response.headers["Cache-Control"] = "private, no-store"
    with connect() as db:
        return interactive_book_snapshot(db, child_id, actor)


@app.post("/api/interactive-storybooks/{child_id}/toy/events")
def interactive_book_event(child_id: int, payload: StorybookEvent, user: dict = Depends(get_current_user)) -> dict:
    actor = interactive_book_access(child_id, user)
    if not actor.startswith("preview:"):
        ensure_privacy_consent(child_id)
    if payload.version != INTERACTIVE_BOOK["version"]:
        raise HTTPException(409, "Версия книги изменилась. Откройте её снова")
    with connect() as db:
        snapshot = interactive_book_snapshot(db, child_id, actor)
        if any(event["id"] == payload.event_id for event in snapshot["state"]["events"]):
            return snapshot
        scene = INTERACTIVE_BOOK["scenes"][snapshot["state"]["scene_index"]]
        if snapshot["revision"] != payload.expected_revision or scene["id"] != payload.scene_id:
            raise HTTPException(409, "Прохождение изменилось в другой вкладке. Откройте книгу снова")
        try:
            state = book_transition(snapshot["state"], payload.action, payload.event_id)
        except ValueError as cause:
            raise HTTPException(422, str(cause)) from None
        changed = db.execute("""INSERT INTO storybook_progress(child_id,story_key,story_version,actor_key,revision,state_json,updated_at)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT(child_id,story_key,story_version,actor_key) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json,updated_at=excluded.updated_at
            WHERE storybook_progress.revision=? RETURNING revision""", (child_id, "toy", INTERACTIVE_BOOK["version"], actor, payload.expected_revision + 1, json.dumps(state, ensure_ascii=False), now_iso(), payload.expected_revision)).fetchone()
        if not changed:
            raise HTTPException(409, "Прохождение изменилось. Откройте книгу снова")
    return {**snapshot, "state": state, "revision": changed["revision"]}


@app.post("/api/aac/cards", status_code=201)
def create_aac_card(payload: AACCardCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    if payload.image.startswith("data:"):
        mime, separator, encoded = payload.image.partition(",")
        if not separator or mime not in {"data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"}:
            raise HTTPException(422, "Карточке нужна фотография JPEG, PNG или WebP")
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, "Фотография карточки повреждена") from None
        valid = {"data:image/jpeg;base64": raw.startswith(b"\xff\xd8\xff"), "data:image/png;base64": raw.startswith(b"\x89PNG\r\n\x1a\n"), "data:image/webp;base64": raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"}
        if not valid[mime] or not 100 <= len(raw) <= 650_000:
            raise HTTPException(422, "Фотография карточки должна быть размером до 650 КБ")
    elif not payload.image.startswith("/") or payload.image.startswith("//") or len(payload.image) > 200:
        raise HTTPException(422, "Изображение карточки должно быть локальным")
    with connect() as db:
        duplicate = db.execute(
            """SELECT id FROM aac_cards
               WHERE is_active=1 AND language=? AND (child_id IS NULL OR child_id=?)
                 AND (lower(trim(label))=lower(trim(?)) OR lower(trim(speech))=lower(trim(?)))
               LIMIT 1""",
            (payload.language, payload.child_id, payload.label, payload.speech),
        ).fetchone()
        if duplicate:
            raise HTTPException(409, "Такая AAC-карточка уже доступна ребёнку")
        cursor = db.execute(
            "INSERT INTO aac_cards(child_id,label,speech,category,lemma,grammatical_role,language,pictogram,image,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
            (payload.child_id, payload.label.strip(), payload.speech.strip(), payload.category, payload.lemma or payload.label.lower(), payload.grammatical_role, payload.language, payload.pictogram or (payload.image if payload.image.startswith("/") else None), payload.image, user["id"], now_iso()),
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
    return compose_aac_phrase([by_id[card_id] for card_id in unique_ids], payload.language, payload.mode)


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
        composed = compose_aac_phrase(ordered_cards, languages.pop(), payload.mode)
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
    if user["role"] not in {"parent", "student"}:
        raise HTTPException(403, "Только ребёнок или его родитель могут сохранить попытку")
    if payload.actor_role != user["role"]:
        raise HTTPException(403, "Роль исполнителя не совпадает с авторизованным аккаунтом")
    if payload.response_owner == "adult" or payload.support_context == "adult_preview":
        raise HTTPException(422, "Предпросмотр взрослого не сохраняется в результатах ребёнка")
    if payload.response_owner != "child" or payload.support_context == "unknown":
        raise HTTPException(422, "Для новой попытки нужно явно указать ответ ребёнка и контекст помощи")
    if user["role"] == "student" and payload.support_context != "independent":
        raise HTTPException(422, "В детском аккаунте попытка сохраняется как самостоятельное взаимодействие")
    if payload.support_context in {"caregiver_supported", "caregiver_modelled"} and user["role"] != "parent":
        raise HTTPException(422, "Помощь взрослого может фиксироваться только из родительского аккаунта")
    if (payload.attempts_count is None) != (payload.correct_answers is None):
        raise HTTPException(422, "Число попыток и правильных ответов нужно передавать вместе")
    if payload.attempts_count is not None and payload.correct_answers is not None and payload.correct_answers > payload.attempts_count:
        raise HTTPException(422, "Правильных ответов не может быть больше числа попыток")
    if payload.attempts_count is not None and payload.independent_completions + payload.prompted_completions > payload.attempts_count:
        raise HTTPException(422, "Самостоятельных и выполненных с подсказкой раундов не может быть больше общего числа раундов")
    attempt_status = "refused" if payload.prompt_level == "refused" and payload.attempt_status == "completed" else payload.attempt_status
    with connect() as db:
        exercise = published_exercise(db, payload.exercise_id)
        if not exercise:
            raise HTTPException(422, "Задание не опубликовано или находится на проверке")
        if exercise["module"] != payload.module:
            raise HTTPException(422, "Задание не относится к выбранному модулю")
        if exercise["module"] in {"motor", "mixed"} and attempt_status == "completed":
            attempt_status = "participated"
        if exercise["module"] == "motor" and attempt_status == "participated":
            ensure_camera_processing_consent(payload.child_id)
            if payload.details.get("source") != "local-face-movement-check" or payload.details.get("movement_detected") is not True:
                raise HTTPException(422, "Моторная попытка засчитывается только после локально распознанного движения")
        if attempt_status == "completed" and (payload.attempts_count is None or payload.correct_answers is None):
            raise HTTPException(422, "Для игрового результата укажите число попыток и правильных ответов")
        if attempt_status == "completed" and payload.attempts_count == 0:
            raise HTTPException(422, "Для завершённой игровой попытки укажите хотя бы один ответ")
        game_score = calculate_game_score(payload.correct_answers or 0, payload.attempts_count or 0) if attempt_status == "completed" else 0
        adaptive_plan_item_id = None
        if payload.learning_session_id:
            learning = db.execute("SELECT * FROM learning_sessions WHERE id=? AND child_id=?", (payload.learning_session_id, payload.child_id)).fetchone()
            if not learning:
                raise HTTPException(422, "Занятие не найдено")
            planned_ids = json.loads(learning["exercise_ids"])
            if payload.exercise_id not in planned_ids:
                raise HTTPException(422, "Это упражнение не входит в текущее занятие")
            if learning["adaptive_plan_id"]:
                adaptive_item = db.execute(
                    """SELECT id,exercise_version_id FROM adaptive_practice_plan_items
                       WHERE plan_id=? AND exercise_id=?""",
                    (learning["adaptive_plan_id"], payload.exercise_id),
                ).fetchone()
                if not adaptive_item or adaptive_item["exercise_version_id"] != exercise["engine"]["version_id"]:
                    raise HTTPException(409, "План ссылается на другую версию задания. Подготовьте новый план")
                adaptive_plan_item_id = adaptive_item["id"]
        measurement_source = "local_automated_movement_check" if payload.details.get("source") == "local-face-movement-check" else "caregiver_or_user_observation"
        cursor = db.execute(
            """INSERT INTO sessions(child_id,exercise_id,exercise_version_id,module,score,duration_seconds,details,measurement_version,
               learning_session_id,sequence_index,independence,prompt_level,response_ms,communication_initiatives,
               attempts_count,correct_answers,prompts_used,gameplay_choices,independent_completions,prompted_completions,
               attempt_status,adaptive_plan_item_id,actor_role,response_owner,support_context,created_at)
               VALUES(?,?,?,?,?,?,?,3,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
            (payload.child_id, payload.exercise_id, exercise["engine"]["version_id"], payload.module, game_score, payload.duration_seconds,
             json.dumps({**payload.details, "measurement_source": measurement_source}, ensure_ascii=False), payload.learning_session_id, payload.sequence_index,
             payload.independence, payload.prompt_level, payload.response_ms, payload.communication_initiatives,
             payload.attempts_count, payload.correct_answers, payload.prompts_used, payload.gameplay_choices,
             payload.independent_completions, payload.prompted_completions, attempt_status, adaptive_plan_item_id,
             user["role"], payload.response_owner, payload.support_context, now_iso()),
        )
        row = db.execute("SELECT * FROM sessions WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
        if payload.learning_session_id:
            published_ids = {item["id"] for item in active_exercise_rows(db)}
            available_planned_ids = [exercise_id for exercise_id in planned_ids if exercise_id in published_ids]
            completed_ids = {
                item["exercise_id"]
                for item in db.execute(
                    """SELECT DISTINCT exercise_id FROM sessions
                       WHERE learning_session_id=? AND measurement_version>=1
                         AND response_owner='child' AND support_context<>'unknown'
                         AND attempt_status IN ('completed','participated','refused')""",
                    (payload.learning_session_id,),
                ).fetchall()
            }
            completed_count = sum(1 for exercise_id in available_planned_ids if exercise_id in completed_ids)
            planned_count = len(available_planned_ids)
            if completed_count >= planned_count:
                db.execute("UPDATE learning_sessions SET status='completed',current_index=?,completed_at=? WHERE id=?", (planned_count, now_iso(), payload.learning_session_id))
            else:
                db.execute("UPDATE learning_sessions SET current_index=? WHERE id=?", (completed_count, payload.learning_session_id))
        if attempt_status in {"completed", "participated"}:
            db.execute("UPDATE assigned_exercises SET status='completed',completed_at=? WHERE child_id=? AND exercise_id=? AND status='assigned'", (now_iso(), payload.child_id, payload.exercise_id))
            create_module_notification(db, payload.child_id, payload.exercise_id)
    result = dict(row)
    result["details"] = json.loads(result["details"])
    reliable_evidence = payload.support_context in {"independent", "caregiver_supported"}
    result["awarded_stars"] = (1 if attempt_status == "participated" else max(1, game_score // 20) if attempt_status == "completed" else 0) if reliable_evidence else 0
    return result


def build_skill_progress(rows, exercise_rows) -> list[dict]:
    results: list[dict] = []
    for skill, meta in SKILL_META.items():
        skill_exercise_ids = {row["id"] for row in exercise_rows if row.get("skill") == skill}
        skill_rows = [row for row in rows if row["exercise_id"] in skill_exercise_ids]
        scored_rows = [
            row for row in skill_rows
            if row.get("attempt_status") == "completed"
            and row.get("attempts_count")
            and row.get("support_context") in {"independent", "caregiver_supported"}
        ]
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
        rows = db.execute(
            """SELECT * FROM sessions
               WHERE child_id=? AND measurement_version>=1
                 AND response_owner='child' AND support_context<>'unknown'
               ORDER BY created_at,id""",
            (child_id,),
        ).fetchall()
        exercise_rows = active_exercise_rows(db)
    rows = [dict(row) for row in rows]
    scored_rows = [
        row for row in rows
        if row.get("attempt_status", "completed") == "completed"
        and row.get("support_context") in {"independent", "caregiver_supported"}
    ]
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
    observed_rows = [
        row for row in rows
        if row.get("attempt_status") in {"completed", "participated"}
        and row.get("support_context") in {"independent", "caregiver_supported"}
    ]
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
            "modelled_responses": sum(1 for row in rows if row.get("support_context") == "caregiver_modelled"),
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
        rows = db.execute(
            """SELECT id,exercise_id,module,score,duration_seconds,attempts_count,correct_answers,prompts_used,
                      attempt_status,actor_role,response_owner,support_context,created_at
               FROM sessions
               WHERE child_id=? AND measurement_version>=1
                 AND response_owner='child' AND support_context<>'unknown'
               ORDER BY created_at,id""",
            (child_id,),
        ).fetchall()
        exercise_rows = active_exercise_rows(db)
    scored_rows = [
        row for row in rows
        if row["attempt_status"] == "completed"
        and row["support_context"] in {"independent", "caregiver_supported"}
    ]
    completion_rows = [row for row in rows if row["attempt_status"] in {"completed", "participated"}]
    activity_statuses = {"completed", "participated", "refused"}

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

    activity_rows = [(row, day) for row, day in parsed if row["attempt_status"] in activity_statuses]
    active_dates = sorted({day for _, day in activity_rows}, reverse=True)
    streak = 0
    cursor = today if today in active_dates else today - timedelta(days=1)
    while cursor in active_dates:
        streak += 1
        cursor -= timedelta(days=1)

    today_rows = [row for row, day in activity_rows if day == today]
    week_rows = [row for row, day in activity_rows if week_start <= day <= today]
    week_activity = []
    for offset, label in enumerate(("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")):
        day = week_start + timedelta(days=offset)
        sessions = sum(1 for _, row_day in activity_rows if row_day == day)
        week_activity.append({
            "date": day.isoformat(),
            "label": label,
            "active": sessions > 0,
            "sessions": sessions,
            "today": day == today,
        })
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
            scores = [
                row["score"] for row, row_day in parsed
                if row_day == day and row["module"] == module and row["attempt_status"] == "completed"
                and row["support_context"] in {"independent", "caregiver_supported"}
            ]
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
        "week_activity": week_activity,
        "streak_days": streak,
        "stars": sum(max(1, row["score"] // 20) for row in scored_rows) + sum(
            1 for row in completion_rows
            if row["attempt_status"] == "participated" and row["support_context"] in {"independent", "caregiver_supported"}
        ),
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
        all_exercises = active_exercise_rows(db)
        history_rows = db.execute(
            """SELECT exercise_id FROM sessions
               WHERE child_id=? AND exercise_id IS NOT NULL AND measurement_version>=1
                 AND response_owner='child' AND support_context<>'unknown'
               ORDER BY id DESC""",
            (child_id,),
        ).fetchall()
    usage_count: dict[int, int] = defaultdict(int)
    last_used_rank: dict[int, int] = {}
    for rank, row in enumerate(history_rows):
        exercise_id = row["exercise_id"]
        usage_count[exercise_id] += 1
        last_used_rank.setdefault(exercise_id, rank)
    # Keep transitions low: each exercise is a complete activity, not a single tap.
    target_count = {3: 2, 5: 3, 10: 5}[minutes]
    selected: list[dict] = []
    seen: set[int] = set()
    candidates = [dict(row) for row in all_exercises if row["id"] not in seen]
    while candidates and len(selected) < target_count:
        module_counts = {name: sum(1 for item in selected if item["module"] == name) for name in ("motor", "sensory", "mixed")}
        candidates.sort(key=lambda item: (
            usage_count[item["id"]],
            module_counts[item["module"]],
            -last_used_rank.get(item["id"], 10**9),
            item["difficulty"],
            item["id"],
        ))
        item = candidates.pop(0)
        selected.append(item)
        seen.add(item["id"])
    return {"child": child, "focus_skill": None, "selection_method": "local_least_used_rotation", "estimated_minutes": minutes, "exercises": selected}


@app.post("/api/adaptive-plans/{child_id}", status_code=201)
def prepare_adaptive_plan(child_id: int, payload: AdaptivePlanRequest, user: dict = Depends(get_current_user)) -> dict:
    child = ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    creator_id = user["id"] if user["role"] == "parent" else child["parent_id"]
    with connect() as db:
        result = create_adaptive_plan(db, child_id, payload.target_minutes, creator_id)
    audit(user, "adaptive_plan.prepare", "child", child_id, {
        "plan_id": result["id"], "rules_version": result["rules_version"], "item_count": len(result["items"]),
    })
    return result


@app.get("/api/adaptive-plans/{child_id}/history")
def list_adaptive_plan_history(child_id: int, user: dict = Depends(require_roles("parent"))) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        return adaptive_plan_history(db, child_id)


@app.get("/api/adaptive-plans/{child_id}/{plan_id}")
def read_adaptive_plan(child_id: int, plan_id: int, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(child_id, user)
    with connect() as db:
        result = get_adaptive_plan(db, plan_id, child_id)
    if not result:
        raise HTTPException(404, "План не найден")
    return result


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
    with connect() as db:
        available = {item["id"]: item for item in active_exercise_rows(db)}
        if any(item_id not in available for item_id in unique_ids):
            raise HTTPException(422, "Одно из заданий не опубликовано или находится на проверке")
        if payload.adaptive_plan_id:
            plan = db.execute(
                "SELECT * FROM adaptive_practice_plans WHERE id=? AND child_id=?",
                (payload.adaptive_plan_id, payload.child_id),
            ).fetchone()
            if not plan:
                raise HTTPException(422, "Адаптивный план не найден")
            plan_items = db.execute(
                """SELECT exercise_id,exercise_version_id FROM adaptive_practice_plan_items
                   WHERE plan_id=? ORDER BY position,id""",
                (payload.adaptive_plan_id,),
            ).fetchall()
            planned_ids = [item["exercise_id"] for item in plan_items]
            if unique_ids != planned_ids:
                raise HTTPException(422, "Состав занятия не совпадает с подготовленным планом")
            if any(available[item["exercise_id"]]["engine"]["version_id"] != item["exercise_version_id"] for item in plan_items):
                raise HTTPException(409, "Версия одного из заданий изменилась. Подготовьте новый план")
        cursor = db.execute(
            """INSERT INTO learning_sessions(
                   child_id,status,exercise_ids,current_index,target_minutes,started_at,adaptive_plan_id)
               VALUES(?,'in_progress',?,0,?,?,?) RETURNING id""",
            (payload.child_id, json.dumps(unique_ids), payload.target_minutes, now_iso(), payload.adaptive_plan_id),
        )
        session_id = cursor.fetchone()["id"]
        if payload.adaptive_plan_id:
            db.execute(
                "UPDATE adaptive_practice_plans SET status='started',started_at=? WHERE id=?",
                (now_iso(), payload.adaptive_plan_id),
            )
    with connect() as db:
        session_row = db.execute("SELECT * FROM learning_sessions WHERE id=?", (session_id,)).fetchone()
        return learning_session_payload(db, session_row)


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
        return learning_session_payload(db, session)


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
    if session["status"] == "completed":
        return None
    desired_count = {3: 2, 5: 3, 10: 5}.get(session["target_minutes"], 3)
    stored_ids = list(session["exercise_ids"])
    available_ids = [exercise["id"] for exercise in session["exercises"]]
    if len(available_ids) < desired_count and not session.get("adaptive_plan_id"):
        with connect() as db:
            candidates = [item for item in active_exercise_rows(db) if item["id"] not in set(stored_ids)]
            while candidates and len(available_ids) < desired_count:
                module_counts = {name: sum(1 for exercise in session["exercises"] if exercise["module"] == name) for name in ("motor", "sensory", "mixed")}
                candidates.sort(key=lambda item: (module_counts[item["module"]], item["id"]))
                chosen = candidates.pop(0)
                stored_ids.append(chosen["id"])
                available_ids.append(chosen["id"])
                session["exercises"].append({"module": chosen["module"]})
            db.execute("UPDATE learning_sessions SET exercise_ids=? WHERE id=?", (json.dumps(stored_ids), row["id"]))
        session = get_learning_session(row["id"], user)
    return session


@app.post("/api/ai/plan/{child_id}")
def ai_plan(child_id: int, payload: AIPlanRequest, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(child_id, user)
    plan = session_plan(child_id, payload.target_minutes, user)
    plan.update({
        "title": "Спокойная практика на сегодня",
        "reason": "Задания выбраны локальными правилами из проверенной библиотеки без обращения к внешней модели.",
        "parent_tip": "Предлагайте выбор, ждите ответ не меньше пяти секунд и спокойно завершайте занятие после отказа.",
        "generated_by": "local_rules",
        "model": None,
        "needs_ai_consent": False,
        "disclaimer": LOCAL_ASSISTANT_DISCLAIMER,
    })
    return plan


@app.post("/api/ai/ask/{child_id}")
def ai_ask(child_id: int, payload: AIAskRequest, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    result = answer_parent({"parent_question": payload.question})
    audit(user, "local_assistant.ask", "child", child_id, {"rules": "parent-guidance-1"})
    return {
        "answer": str(result["answer"])[:1600],
        "suggested_actions": [str(item)[:240] for item in result["suggested_actions"][:3]],
        "needs_professional_help": bool(result["needs_professional_help"]),
        "safety_note": str(result["safety_note"])[:600],
        "generated_by": "local_rules",
        "model": None,
        "disclaimer": LOCAL_ASSISTANT_DISCLAIMER,
    }


@app.get("/api/specialist/children/{child_id}", include_in_schema=False)
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


@app.post("/api/specialist/assigned-exercises", status_code=201, include_in_schema=False)
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


@app.post("/api/specialist/recommendations", status_code=201, include_in_schema=False)
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


@app.get("/api/goals/{child_id}", include_in_schema=False)
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


@app.post("/api/specialist/goals", status_code=201, include_in_schema=False)
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


@app.patch("/api/specialist/goals/{goal_id}", include_in_schema=False)
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


@app.get("/api/homework/{child_id}", include_in_schema=False)
def list_homework(child_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT * FROM homework_assignments WHERE child_id=? ORDER BY id DESC LIMIT 30", (child_id,)).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/specialist/homework", status_code=201, include_in_schema=False)
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


@app.patch("/api/homework/{homework_id}/result", include_in_schema=False)
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


@app.get("/api/observations/{child_id}")
def list_skill_observations(child_id: int, user: dict = Depends(require_roles("parent"))) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        return skill_map(db, child_id)


@app.get("/api/practice-goal-templates")
def practice_goal_templates(user: dict = Depends(require_roles("parent"))) -> list[dict]:
    with connect() as db:
        return list_practice_goal_templates(db)


@app.get("/api/practice-goals/{child_id}")
def practice_goals(child_id: int, user: dict = Depends(require_roles("parent"))) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        return list_practice_goals(db, child_id)


@app.post("/api/practice-goals", status_code=201)
def add_practice_goal(payload: PracticeGoalCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    with connect() as db:
        result = create_practice_goal(
            db, payload.child_id, payload.template_key, payload.baseline, payload.help_level, user["id"]
        )
    audit(user, "practice_goal.create", "practice_goal", result["id"], {"child_id": payload.child_id})
    return result


@app.patch("/api/practice-goals/{goal_id}")
def edit_practice_goal(goal_id: int, payload: PracticeGoalUpdate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    changes = payload.model_dump(exclude={"child_id", "expected_version"}, exclude_none=True)
    with connect() as db:
        result = update_practice_goal(db, goal_id, payload.child_id, payload.expected_version, changes, user["id"])
    audit(user, "practice_goal.update", "practice_goal", goal_id, {"child_id": payload.child_id, "version": result["version"]})
    return result


@app.post("/api/practice-goals/{goal_id}/observations", status_code=201)
def add_practice_goal_observation(goal_id: int, payload: PracticeGoalObservationCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    value = payload.model_dump(exclude={"child_id"})
    if value.get("observed_at"):
        value["observed_at"] = value["observed_at"].isoformat()
    with connect() as db:
        result = save_practice_goal_observation(db, goal_id, payload.child_id, value, user["id"])
    audit(user, "practice_goal.observation", "practice_goal", goal_id, {"result_type": payload.result_type})
    return result


@app.put("/api/practice-goals/{goal_id}/observations/{observation_id}")
def edit_practice_goal_observation(goal_id: int, observation_id: int, payload: PracticeGoalObservationCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(payload.child_id, user)
    ensure_privacy_consent(payload.child_id)
    value = payload.model_dump(exclude={"child_id"})
    if value.get("observed_at"):
        value["observed_at"] = value["observed_at"].isoformat()
    with connect() as db:
        result = save_practice_goal_observation(db, goal_id, payload.child_id, value, user["id"], observation_id)
    audit(user, "practice_goal.observation_update", "practice_goal_observation", observation_id, {"goal_id": goal_id})
    return result


@app.get("/api/practice-preferences/{child_id}")
def practice_preferences(child_id: int, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    with connect() as db:
        return get_preferences(db, child_id)


@app.put("/api/practice-preferences/{child_id}")
def update_practice_preferences(child_id: int, payload: PracticePreferencesUpdate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    with connect() as db:
        result = save_preferences(db, child_id, payload.model_dump(), user["id"])
    audit(user, "practice_preferences.update", "child", child_id, {})
    return result


@app.put("/api/observations/{child_id}/{category}")
def save_skill_observation(child_id: int, category: str, payload: SkillObservationUpdate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    value = payload.model_dump()
    if value.get("observed_at"):
        value["observed_at"] = value["observed_at"].isoformat()
    with connect() as db:
        result = upsert_skill_observation(db, child_id, category, value, user["id"])
    audit(user, "observation.save", "child", child_id, {"category": category, "status": payload.status})
    return result


@app.get("/api/home-activities/{child_id}")
def list_home_activities(child_id: int, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    with connect() as db:
        return home_library(db, child_id)


@app.post("/api/home-activities/{child_id}/observations", status_code=201)
def create_home_activity_observation(child_id: int, payload: HomeActivityObservationCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    value = payload.model_dump()
    if value.get("observed_at"):
        value["observed_at"] = value["observed_at"].isoformat()
    with connect() as db:
        result = save_home_observation(db, child_id, value, user["id"])
    audit(user, "home_activity.observe", "home_activity_observation", result["id"], {"child_id": child_id, "outcome": payload.outcome})
    return result


@app.put("/api/home-activities/{child_id}/observations/{observation_id}")
def update_home_activity_observation(child_id: int, observation_id: int, payload: HomeActivityObservationCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    ensure_privacy_consent(child_id)
    value = payload.model_dump()
    if value.get("observed_at"):
        value["observed_at"] = value["observed_at"].isoformat()
    with connect() as db:
        result = save_home_observation(db, child_id, value, user["id"], observation_id)
    audit(user, "home_activity.observation.update", "home_activity_observation", observation_id, {"child_id": child_id, "outcome": payload.outcome})
    return result


@app.get("/api/results/{child_id}/summary")
def results_summary(child_id: int, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    with connect() as db:
        return descriptive_results(db, child_id)


@app.get("/api/children/{child_id}/consent")
def get_consent(child_id: int, user: dict = Depends(require_roles("parent", "student"))) -> dict:
    ensure_child_access(child_id, user)
    return consent_record(child_id)


@app.put("/api/children/{child_id}/consent")
def update_consent(child_id: int, payload: ConsentUpdate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(child_id, user)
    if not payload.privacy_accepted and (payload.camera_processing or payload.ai_processing or payload.analytics_processing):
        raise HTTPException(422, "Дополнительные разрешения можно включить только после принятия обязательных условий")
    previous = consent_record(child_id)
    stamp = now_iso()
    accepted_at = lambda key, enabled: (previous.get(f"{key}_at") or stamp) if enabled else None
    with connect() as db:
        db.execute(
            """INSERT INTO child_consents(
                   child_id,parent_id,privacy_accepted,camera_processing,specialist_sharing,ai_processing,analytics_processing,
                   consented_by_user_id,privacy_accepted_at,camera_processing_at,specialist_sharing_at,ai_processing_at,
                   analytics_processing_at,version,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(child_id) DO UPDATE SET
                   parent_id=excluded.parent_id,privacy_accepted=excluded.privacy_accepted,
                   camera_processing=excluded.camera_processing,specialist_sharing=0,ai_processing=excluded.ai_processing,
                   analytics_processing=excluded.analytics_processing,consented_by_user_id=excluded.consented_by_user_id,
                   privacy_accepted_at=excluded.privacy_accepted_at,camera_processing_at=excluded.camera_processing_at,
                   specialist_sharing_at=NULL,ai_processing_at=excluded.ai_processing_at,
                   analytics_processing_at=excluded.analytics_processing_at,
                   version=excluded.version,updated_at=excluded.updated_at""",
            (
                child_id, user["id"], int(payload.privacy_accepted), int(payload.camera_processing),
                0, int(payload.ai_processing), int(payload.analytics_processing), user["id"],
                accepted_at("privacy_accepted", payload.privacy_accepted),
                accepted_at("camera_processing", payload.camera_processing),
                None,
                accepted_at("ai_processing", payload.ai_processing),
                accepted_at("analytics_processing", payload.analytics_processing),
                CONSENT_VERSION, stamp,
            ),
        )
    audit(user, "consent.update", "child", child_id, {
        "privacy": payload.privacy_accepted,
        "camera": payload.camera_processing,
        "ai_processing": payload.ai_processing,
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
            "ai_usage": [dict(row) for row in db.execute(
                """SELECT provider,model,feature,input_tokens,output_tokens,estimated_cost_usd,created_at
                   FROM usage_events WHERE child_id=? ORDER BY id""",
                (child_id,),
            ).fetchall()],
            "assigned_exercises": [dict(row) for row in db.execute("SELECT * FROM assigned_exercises WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "specialist_access": [dict(row) for row in db.execute("SELECT * FROM specialist_children WHERE child_id=? ORDER BY assigned_at", (child_id,)).fetchall()],
            "specialist_recommendations": [dict(row) for row in db.execute("SELECT * FROM specialist_recommendations WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "goals": goal_rows,
            "homework": [dict(row) for row in db.execute("SELECT * FROM homework_assignments WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "skill_observations": [dict(row) for row in db.execute("SELECT * FROM skill_observations WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "home_activity_observations": [dict(row) for row in db.execute("SELECT * FROM home_activity_observations WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "practice_goals": list_practice_goals(db, child_id),
            "practice_preferences": get_preferences(db, child_id),
            "adaptive_practice_plans": adaptive_plan_history(db, child_id),
            "aac_custom_cards": [dict(row) for row in db.execute("SELECT * FROM aac_cards WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "aac_favorites": [dict(row) for row in db.execute("SELECT * FROM aac_favorites WHERE child_id=? ORDER BY card_id", (child_id,)).fetchall()],
            "aac_history": history_rows,
            "world_photos": [dict(row) for row in db.execute("SELECT * FROM child_world_photos WHERE child_id=? ORDER BY id", (child_id,)).fetchall()],
            "storybook_progress": [dict(row) for row in db.execute("SELECT * FROM storybook_progress WHERE child_id=? ORDER BY story_key,story_version,actor_key", (child_id,)).fetchall()],
            "story_progress": [dict(row) for row in db.execute("SELECT * FROM child_story_progress WHERE child_id=? ORDER BY story_key", (child_id,)).fetchall()],
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


@app.patch("/api/specialist/recommendations/{recommendation_id}", include_in_schema=False)
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


@app.get("/api/admin/specialist-assignments", include_in_schema=False)
def specialist_assignments(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            """SELECT sc.specialist_id,sc.child_id,sc.assigned_at,u.full_name specialist_name,c.name child_name
               FROM specialist_children sc JOIN users u ON u.id=sc.specialist_id
               JOIN children c ON c.id=sc.child_id ORDER BY sc.assigned_at DESC"""
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/admin/specialist-assignments", status_code=201, include_in_schema=False)
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


@app.delete("/api/admin/specialist-assignments/{specialist_id}/{child_id}", status_code=204, include_in_schema=False)
def delete_specialist_assignment(specialist_id: int, child_id: int, admin: dict = Depends(require_roles("admin"))):
    with connect() as db:
        db.execute("DELETE FROM specialist_children WHERE specialist_id=? AND child_id=?", (specialist_id, child_id))
    audit(admin, "specialist.unassign", "child", child_id, {"specialist_id": specialist_id})


@app.get("/api/admin/stats")
def admin_stats(_: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        return {
            "users": db.execute("SELECT (SELECT COUNT(*) FROM users WHERE role<>'specialist') + (SELECT COUNT(*) FROM student_accounts) count").fetchone()["count"],
            "children": db.execute("SELECT COUNT(*) count FROM children").fetchone()["count"],
            "sessions": db.execute("SELECT COUNT(*) count FROM sessions WHERE measurement_version>=1").fetchone()["count"],
            "exercises": db.execute("SELECT COUNT(*) count FROM exercises WHERE is_active=1").fetchone()["count"],
        }


@app.get("/api/admin/users")
def admin_users(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        return [public_user(row) for row in db.execute("SELECT * FROM users WHERE role<>'specialist' ORDER BY created_at DESC").fetchall()]


@app.get("/api/admin/students")
def admin_students(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        rows = db.execute("SELECT s.id,s.username,s.is_active,s.created_at,s.child_id,c.name child_name,u.full_name parent_name FROM student_accounts s JOIN children c ON c.id=s.child_id JOIN users u ON u.id=c.parent_id ORDER BY s.created_at DESC").fetchall()
    return [dict(row) for row in rows]


@app.get("/api/admin/usage")
def admin_usage(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=50, ge=1, le=200),
    _: dict = Depends(require_roles("admin")),
) -> dict:
    today = datetime.now(timezone.utc).date()
    cutoff = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), tzinfo=timezone.utc).isoformat()
    with connect() as db:
        totals = db.execute("SELECT COUNT(*) requests,COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(estimated_cost_usd),0) cost FROM usage_events WHERE provider='openai' AND created_at >= ?", (cutoff,)).fetchone()
        breakdown = db.execute("SELECT provider,model,feature,COUNT(*) requests,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(estimated_cost_usd) cost FROM usage_events WHERE provider='openai' AND created_at >= ? GROUP BY provider,model,feature ORDER BY requests DESC", (cutoff,)).fetchall()
        daily_rows = db.execute(
            """SELECT substr(created_at,1,10) day,COUNT(*) requests,
                      COALESCE(SUM(input_tokens),0) input_tokens,
                      COALESCE(SUM(output_tokens),0) output_tokens,
                      COALESCE(SUM(estimated_cost_usd),0) cost
               FROM usage_events WHERE provider='openai' AND created_at >= ?
               GROUP BY substr(created_at,1,10) ORDER BY day""",
            (cutoff,),
        ).fetchall()
        recent = db.execute(
            """SELECT e.id,e.user_id actor_id,e.actor_type,e.child_id,e.provider,e.model,e.feature,
                      e.input_tokens,e.output_tokens,e.input_tokens+e.output_tokens total_tokens,
                      e.estimated_cost_usd,e.created_at,
                      CASE WHEN e.actor_type='student'
                           THEN COALESCE(c.name,s.username,'Ученик')
                           ELSE COALESCE(u.full_name,'Удалённый пользователь') END actor_name,
                      CASE WHEN e.actor_type='student'
                           THEN COALESCE(s.username,'')
                           ELSE COALESCE(u.username,'') END actor_username,
                      CASE WHEN e.actor_type='student'
                           THEN 'student'
                           ELSE COALESCE(u.role,'unknown') END actor_role,
                      c.name child_name
               FROM usage_events e
               LEFT JOIN users u ON e.actor_type='user' AND u.id=e.user_id
               LEFT JOIN student_accounts s ON e.actor_type='student' AND s.id=e.user_id
               LEFT JOIN children c ON c.id=e.child_id
               WHERE e.provider='openai' AND e.created_at >= ?
               ORDER BY e.id DESC LIMIT ?""",
            (cutoff, limit),
        ).fetchall()
    daily_by_date = {row["day"]: dict(row) for row in daily_rows}
    daily = []
    for days_ago in range(days - 1, -1, -1):
        day = (today - timedelta(days=days_ago)).isoformat()
        row = daily_by_date.get(day, {})
        input_tokens = int(row.get("input_tokens", 0))
        output_tokens = int(row.get("output_tokens", 0))
        daily.append({
            "date": day,
            "requests": int(row.get("requests", 0)),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "estimated_cost_usd": round(float(row.get("cost", 0)), 6),
        })
    return {
        "period_days": days,
        "requests": totals["requests"],
        "input_tokens": totals["input_tokens"],
        "output_tokens": totals["output_tokens"],
        "total_tokens": totals["input_tokens"] + totals["output_tokens"],
        "estimated_cost_usd": round(totals["cost"], 6),
        "breakdown": [dict(row) for row in breakdown],
        "daily": daily,
        "recent": [dict(row) for row in recent],
        "note": "Внешняя модель отключена. Раздел хранит только прежние события; локальный анализ не расходует токены и не отправляет данные поставщику AI.",
    }


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
        target = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "Пользователь не найден")
        if target["role"] == "admin" and target["is_active"] and payload.role != "admin":
            active_admins = db.execute("SELECT COUNT(*) count FROM users WHERE role='admin' AND is_active=1").fetchone()["count"]
            if active_admins <= 1:
                raise HTTPException(409, "Нельзя изменить роль последнего активного администратора")
        db.execute("UPDATE users SET role=? WHERE id=?", (payload.role, user_id))
        row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    audit(admin, "user.role", "user", user_id, {"role": payload.role})
    return public_user(row)


@app.patch("/api/admin/users/{user_id}/active")
def update_active(user_id: int, payload: ActiveUpdate, admin: dict = Depends(require_roles("admin"))) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(400, "Нельзя отключить собственный аккаунт")
    with connect() as db:
        target = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "Пользователь не найден")
        if target["role"] == "admin" and target["is_active"] and not payload.is_active:
            active_admins = db.execute("SELECT COUNT(*) count FROM users WHERE role='admin' AND is_active=1").fetchone()["count"]
            if active_admins <= 1:
                raise HTTPException(409, "Нельзя отключить последнего активного администратора")
        db.execute("UPDATE users SET is_active=? WHERE id=?", (int(payload.is_active), user_id))
        row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    audit(admin, "user.active", "user", user_id, {"active": payload.is_active})
    return public_user(row)


@app.get("/api/admin/exercise-drafts")
def list_exercise_drafts(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            "SELECT id FROM exercise_versions WHERE publication_status='draft' ORDER BY id DESC"
        ).fetchall()
        return [preview_version(db, row["id"]) for row in rows]


@app.post("/api/admin/exercise-drafts", status_code=201)
def create_exercise_draft(payload: ExerciseDraftCreate, admin: dict = Depends(require_roles("admin"))) -> dict:
    value = payload.model_dump()
    with connect() as db:
        version = create_draft(db, value, admin["id"])
        result = preview_version(db, version["id"])
    audit(admin, "exercise.draft.create", "exercise_version", version["id"], {"exercise_id": version["exercise_id"], "mechanic": version["mechanic"]})
    return result


@app.get("/api/admin/exercise-drafts/{version_id}/preview")
def preview_exercise_draft(version_id: int, admin: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        return review_workspace(db, version_id, admin["id"])


@app.get("/api/admin/content-review/capabilities")
def content_review_capabilities(admin: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        return review_capabilities(db, admin["id"])


@app.post("/api/admin/exercise-drafts/{version_id}/reviews")
def review_exercise_draft(version_id: int, payload: ContentReviewCreate, admin: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        result = submit_content_review(
            db,
            version_id,
            admin["id"],
            payload.stage,
            payload.decision,
            payload.comment,
        )
    audit(
        admin,
        "exercise.version.review",
        "exercise_version",
        version_id,
        {"stage": payload.stage, "decision": payload.decision},
    )
    return result


@app.get("/api/admin/home-activity-drafts")
def list_home_activity_drafts(_: dict = Depends(require_roles("admin"))) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM home_activity_templates WHERE publication_status='draft' ORDER BY position,id"
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        for field in ("materials", "adult_instructions", "accepted_responses", "prompts", "stop_conditions"):
            item[field] = json.loads(item.pop(f"{field}_json") or "[]")
        item["method_card"] = json.loads(item.pop("method_card_json", "{}") or "{}")
        result.append(item)
    return result


@app.post("/api/admin/exercise-drafts/{version_id}/publish")
def publish_exercise_draft(version_id: int, admin: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        version = publish_version(db, version_id)
    audit(admin, "exercise.version.publish", "exercise_version", version_id, {"exercise_id": version["exercise_id"]})
    return version


@app.delete("/api/admin/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, _: dict = Depends(require_roles("admin"))):
    with connect() as db:
        db.execute("UPDATE exercises SET is_active=0 WHERE id=?", (exercise_id,))
        db.execute("UPDATE exercise_versions SET publication_status='archived' WHERE exercise_id=? AND publication_status='published'", (exercise_id,))

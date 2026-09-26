import json
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .database import connect, init_db, now_iso
from .schemas import AACCardCreate, AACFavoriteUpdate, AACPhraseCreate, ActiveUpdate, AssignedExerciseCreate, ChildCreate, ExerciseCreate, LearningSessionCreate, LoginRequest, RecommendationReview, RegisterRequest, RoleUpdate, SessionCreate, SpecialistAssignmentCreate, SpecialistRecommendationCreate, StudentAccountCreate, StudentLoginRequest, UserSettingsUpdate
from .security import create_access_token, create_student_access_token, get_current_user, hash_password, require_roles, verify_password


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Söyle API", version="1.0.0", lifespan=lifespan)
allowed_origins = [origin.strip() for origin in os.getenv(
    "SOYLE_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
).split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=os.getenv("SOYLE_ALLOWED_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COURSE_UNITS = [
    {"id": "intro", "label": "Вводный курс", "title": "Я могу сообщить о важном", "targets": ["help", "desire", "need"], "practice": "В течение дня создайте 3 спокойные ситуации, где ребёнок сможет попросить помощь, перерыв или желаемый предмет."},
    {"id": "food", "label": "Модуль 1", "title": "Еда и продукты", "targets": ["food", "request", "preference"], "practice": "Во время еды предлагайте выбор из двух продуктов и дайте ребёнку время попросить нужное словом или карточкой."},
    {"id": "home", "label": "Модуль 2", "title": "Дом и семья", "targets": ["family", "observation", "animals"], "practice": "Называйте близких и знакомые предметы дома, затем задавайте короткий вопрос: «Кто это?» или «Что ты видишь?»."},
    {"id": "play", "label": "Модуль 3", "title": "Игрушки и признаки", "targets": ["toys", "qualities"], "practice": "В игре просите выбрать большой или маленький предмет и поощряйте просьбы «дай мяч» и «хочу ещё»."},
    {"id": "actions", "label": "Модуль 4", "title": "Действия и мой день", "targets": ["actions", "commands", "routine"], "practice": "Комментируйте знакомые действия короткими фразами и вместе составьте последовательность из 2–3 событий дня."},
    {"id": "feelings", "label": "Модуль 5", "title": "Чувства и состояние", "targets": ["feelings"], "practice": "Несколько раз в день предлагайте выбрать карточку состояния: весело, грустно, больно, устал или нужен перерыв."},
    {"id": "motor", "label": "Модуль 6", "title": "Артикуляционная гимнастика", "targets": ["smile", "tube", "open", "teeth", "cheeks", "sequence"], "practice": "Повторяйте знакомые движения перед зеркалом по 3–5 минут без давления и заканчивайте на успешной попытке."},
]

SKILL_META = {
    "articulation": {"label": "Артикуляция", "practice": "Повторить знакомые движения перед зеркалом"},
    "vocabulary": {"label": "Словарный запас", "practice": "Назвать 3–5 знакомых предметов"},
    "speech_comprehension": {"label": "Понимание речи", "practice": "Выполнить короткую инструкцию из одного шага"},
    "word_repetition": {"label": "Повторение слов", "practice": "Спокойно повторить 3 знакомых слова"},
    "phrase_building": {"label": "Построение фраз", "practice": "Собрать короткую фразу из 2–3 карточек"},
    "communication": {"label": "Коммуникация", "practice": "Попросить помощь или сообщить о желании"},
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
            assignment = db.execute("SELECT 1 FROM specialist_children WHERE specialist_id=? AND child_id=?", (user["id"], child_id)).fetchone()
        if not assignment:
            raise HTTPException(403, "Ребёнок не назначен этому специалисту")
    return dict(child)


def settings_key(user: dict) -> str:
    account_type = "student" if user["role"] == "student" else "user"
    return f"{account_type}:{user['id']}"


def public_settings(row=None) -> dict:
    if not row:
        return {"camera_enabled": True, "sound_enabled": True, "calm_mode": False, "theme": "peach"}
    return {
        "camera_enabled": bool(row["camera_enabled"]),
        "sound_enabled": bool(row["sound_enabled"]),
        "calm_mode": bool(row["calm_mode"]),
        "theme": row["theme"],
    }


def create_module_notification(db, child_id: int, exercise_id: int) -> None:
    exercise = db.execute("SELECT target FROM exercises WHERE id=?", (exercise_id,)).fetchone()
    if not exercise:
        return
    unit = next((item for item in COURSE_UNITS if exercise["target"] in item["targets"]), None)
    if not unit:
        return
    placeholders = ",".join("?" for _ in unit["targets"])
    completed_targets = {
        row["target"] for row in db.execute(
            f"""SELECT DISTINCT e.target FROM sessions s JOIN exercises e ON e.id=s.exercise_id
                WHERE s.child_id=? AND s.measurement_version=1 AND e.target IN ({placeholders})""",
            (child_id, *unit["targets"]),
        ).fetchall()
    }
    if not set(unit["targets"]).issubset(completed_targets):
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
            f"{child['name']}: модуль пройден. Самое время начать практические тренировки дома! {unit['practice']}",
            json.dumps({"unit_id": unit["id"], "unit_label": unit["label"], "unit_title": unit["title"], "practice": unit["practice"]}, ensure_ascii=False),
            now_iso(),
        ),
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "soyle-api"}


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest) -> dict:
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
    return {"access_token": create_access_token(user_id, "parent"), "token_type": "bearer", "user": public_user(row)}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM users WHERE lower(username)=lower(?)", (payload.username,)).fetchone()
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(401, "Неверный логин или пароль")
    if not row["is_active"]:
        raise HTTPException(403, "Аккаунт отключён администратором")
    return {"access_token": create_access_token(row["id"], row["role"]), "token_type": "bearer", "user": public_user(row)}


@app.post("/api/auth/student-login")
def student_login(payload: StudentLoginRequest) -> dict:
    with connect() as db:
        row = db.execute("SELECT s.*,c.name FROM student_accounts s JOIN children c ON c.id=s.child_id WHERE lower(s.username)=lower(?)", (payload.username,)).fetchone()
    if not row or not verify_password(payload.pin, row["pin_hash"]):
        raise HTTPException(401, "Неверный логин или PIN")
    if not row["is_active"]:
        raise HTTPException(403, "Ученический аккаунт отключён")
    user = {"id": row["id"], "username": row["username"], "full_name": row["name"], "role": "student", "is_active": row["is_active"], "created_at": row["created_at"], "child_id": row["child_id"]}
    return {"access_token": create_student_access_token(row["id"]), "token_type": "bearer", "user": user}


@app.get("/api/auth/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    return user


@app.get("/api/settings")
def get_settings(user: dict = Depends(get_current_user)) -> dict:
    with connect() as db:
        row = db.execute("SELECT * FROM user_settings WHERE user_key=?", (settings_key(user),)).fetchone()
    return public_settings(row)


@app.put("/api/settings")
def update_settings(payload: UserSettingsUpdate, user: dict = Depends(get_current_user)) -> dict:
    with connect() as db:
        db.execute(
            """INSERT INTO user_settings(user_key,camera_enabled,sound_enabled,calm_mode,theme,updated_at)
               VALUES(?,?,?,?,?,?)
               ON CONFLICT(user_key) DO UPDATE SET camera_enabled=excluded.camera_enabled,
               sound_enabled=excluded.sound_enabled,calm_mode=excluded.calm_mode,
               theme=excluded.theme,updated_at=excluded.updated_at""",
            (settings_key(user), int(payload.camera_enabled), int(payload.sound_enabled), int(payload.calm_mode), payload.theme, now_iso()),
        )
        row = db.execute("SELECT * FROM user_settings WHERE user_key=?", (settings_key(user),)).fetchone()
    return public_settings(row)


@app.get("/api/notifications")
def list_notifications(user: dict = Depends(require_roles("parent"))) -> dict:
    with connect() as db:
        completed_rows = db.execute(
            """SELECT DISTINCT s.child_id,s.exercise_id FROM sessions s
               JOIN children c ON c.id=s.child_id
               WHERE c.parent_id=? AND s.exercise_id IS NOT NULL AND s.measurement_version=1""",
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
                   JOIN users u ON u.id=c.parent_id WHERE sc.specialist_id=? ORDER BY c.id""",
                (user["id"],),
            ).fetchall()
        else:
            rows = db.execute("SELECT c.*,u.full_name parent_name,u.username parent_username FROM children c JOIN users u ON u.id=c.parent_id ORDER BY c.id").fetchall()
    return [dict(row) for row in rows]


@app.post("/api/children", status_code=201)
def create_child(payload: ChildCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    try:
        date.fromisoformat(payload.birth_date)
    except ValueError:
        raise HTTPException(422, "Дата должна быть в формате YYYY-MM-DD")
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO children(parent_id,name,birth_date,primary_module,avatar_color) VALUES(?,?,?,?,?) RETURNING id",
            (user["id"], payload.name, payload.birth_date, payload.primary_module, payload.avatar_color),
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
def list_exercises(module: str | None = Query(default=None), user: dict = Depends(get_current_user)) -> list[dict]:
    del user
    query, params = "SELECT * FROM exercises WHERE is_active=1", ()
    if module:
        query, params = query + " AND module=?", (module,)
    with connect() as db:
        return [dict(row) for row in db.execute(query + " ORDER BY module,difficulty,id", params).fetchall()]


@app.get("/api/aac/cards/{child_id}")
def aac_cards(child_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute(
            """SELECT c.*,CASE WHEN f.card_id IS NULL THEN 0 ELSE 1 END favorite
               FROM aac_cards c LEFT JOIN aac_favorites f ON f.card_id=c.id AND f.child_id=?
               WHERE c.is_active=1 AND (c.child_id IS NULL OR c.child_id=?)
               ORDER BY c.is_core DESC,c.category,c.id""",
            (child_id, child_id),
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/aac/cards", status_code=201)
def create_aac_card(payload: AACCardCreate, user: dict = Depends(require_roles("parent"))) -> dict:
    ensure_child_access(payload.child_id, user)
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO aac_cards(child_id,label,speech,category,image,created_by,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id",
            (payload.child_id, payload.label, payload.speech, payload.category, payload.image, user["id"], now_iso()),
        )
        row = db.execute("SELECT *,0 favorite FROM aac_cards WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    return dict(row)


@app.patch("/api/aac/cards/{card_id}/favorite")
def favorite_aac_card(card_id: int, child_id: int, payload: AACFavoriteUpdate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(child_id, user)
    with connect() as db:
        card = db.execute("SELECT id FROM aac_cards WHERE id=? AND is_active=1 AND (child_id IS NULL OR child_id=?)", (card_id, child_id)).fetchone()
        if not card:
            raise HTTPException(404, "Карточка не найдена")
        if payload.favorite:
            db.execute("INSERT INTO aac_favorites(child_id,card_id) VALUES(?,?) ON CONFLICT DO NOTHING", (child_id, card_id))
        else:
            db.execute("DELETE FROM aac_favorites WHERE child_id=? AND card_id=?", (child_id, card_id))
    return {"card_id": card_id, "favorite": payload.favorite}


@app.post("/api/aac/history", status_code=201)
def save_aac_phrase(payload: AACPhraseCreate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO aac_phrase_history(child_id,user_key,phrase,card_ids,created_at) VALUES(?,?,?,?,?) RETURNING id",
            (payload.child_id, settings_key(user), payload.phrase, json.dumps(payload.card_ids), now_iso()),
        )
        row = db.execute("SELECT * FROM aac_phrase_history WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
    result = dict(row)
    result["card_ids"] = json.loads(result["card_ids"])
    return result


@app.get("/api/aac/history/{child_id}")
def aac_history(child_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT * FROM aac_phrase_history WHERE child_id=? ORDER BY id DESC LIMIT 12", (child_id,)).fetchall()
    return [{**dict(row), "card_ids": json.loads(row["card_ids"])} for row in rows]


@app.post("/api/sessions", status_code=201)
def create_session(payload: SessionCreate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    with connect() as db:
        exercise = db.execute("SELECT id,module,is_active FROM exercises WHERE id=?", (payload.exercise_id,)).fetchone()
        if not exercise or not exercise["is_active"]:
            raise HTTPException(422, "Задание не найдено или находится в архиве")
        if exercise["module"] != payload.module:
            raise HTTPException(422, "Задание не относится к выбранному модулю")
        if payload.learning_session_id:
            learning = db.execute("SELECT * FROM learning_sessions WHERE id=? AND child_id=?", (payload.learning_session_id, payload.child_id)).fetchone()
            if not learning:
                raise HTTPException(422, "Занятие не найдено")
            planned_ids = json.loads(learning["exercise_ids"])
            if payload.exercise_id not in planned_ids:
                raise HTTPException(422, "Это упражнение не входит в текущее занятие")
        cursor = db.execute(
            """INSERT INTO sessions(child_id,exercise_id,module,score,duration_seconds,details,measurement_version,learning_session_id,sequence_index,created_at)
               VALUES(?,?,?,?,?,?,1,?,?,?) RETURNING id""",
            (payload.child_id, payload.exercise_id, payload.module, payload.score, payload.duration_seconds, json.dumps(payload.details, ensure_ascii=False), payload.learning_session_id, payload.sequence_index, now_iso()),
        )
        row = db.execute("SELECT * FROM sessions WHERE id=?", (cursor.fetchone()["id"],)).fetchone()
        if payload.learning_session_id:
            completed_count = db.execute("SELECT COUNT(DISTINCT exercise_id) count FROM sessions WHERE learning_session_id=? AND measurement_version=1", (payload.learning_session_id,)).fetchone()["count"]
            planned_count = len(json.loads(learning["exercise_ids"]))
            if completed_count >= planned_count:
                db.execute("UPDATE learning_sessions SET status='completed',current_index=?,completed_at=? WHERE id=?", (planned_count, now_iso(), payload.learning_session_id))
            else:
                db.execute("UPDATE learning_sessions SET current_index=? WHERE id=?", (completed_count, payload.learning_session_id))
        if payload.module == "motor" and payload.details.get("source") == "face-landmarker":
            db.execute("INSERT INTO usage_events(user_id,child_id,provider,model,feature,created_at) VALUES(?,?,?,?,?,?)", (user["id"], payload.child_id, "local", "MediaPipe Face Landmarker", "Анализ артикуляции", now_iso()))
        db.execute("UPDATE assigned_exercises SET status='completed',completed_at=? WHERE child_id=? AND exercise_id=? AND status='assigned'", (now_iso(), payload.child_id, payload.exercise_id))
        create_module_notification(db, payload.child_id, payload.exercise_id)
    result = dict(row)
    result["details"] = json.loads(result["details"])
    result["awarded_stars"] = max(1, payload.score // 20)
    return result


def build_skill_progress(rows, exercise_rows) -> list[dict]:
    exercises_by_id = {row["id"]: row for row in exercise_rows}
    results: list[dict] = []
    for skill, meta in SKILL_META.items():
        skill_exercise_ids = {row["id"] for row in exercise_rows if row.get("skill") == skill}
        skill_rows = [row for row in rows if row["exercise_id"] in skill_exercise_ids]
        scores = [row["score"] for row in skill_rows]
        recent_scores = scores[-5:]
        previous_scores = scores[-10:-5]
        current = round(sum(scores) / len(scores)) if scores else 0
        recent = round(sum(recent_scores) / len(recent_scores)) if recent_scores else 0
        previous = round(sum(previous_scores) / len(previous_scores)) if previous_scores else None
        delta = recent - previous if previous is not None else None
        completed = len({row["exercise_id"] for row in skill_rows})
        results.append({
            "skill": skill,
            "label": meta["label"],
            "value": current,
            "recent_change": delta,
            "sessions": len(skill_rows),
            "completed_exercises": completed,
            "total_exercises": len(skill_exercise_ids),
            "recommended_practice": meta["practice"],
        })
    return results


def progress_data(child_id: int, user: dict) -> dict:
    child = ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT * FROM sessions WHERE child_id=? AND measurement_version=1 ORDER BY created_at", (child_id,)).fetchall()
        exercise_rows = [dict(row) for row in db.execute("SELECT id,module,skill FROM exercises WHERE is_active=1").fetchall()]
    rows = [dict(row) for row in rows]
    by_module: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        by_module[row["module"]].append(row["score"])
    labels = {"motor": "Артикуляция", "sensory": "Понимание речи", "mixed": "Построение фраз"}
    skills = [{"module": module, "label": labels[module], "value": round(sum(by_module[module]) / len(by_module[module])) if by_module[module] else 0, "sessions": len(by_module[module])} for module in ("motor", "sensory", "mixed")]
    active_exercise_ids = {
        module: {row["id"] for row in exercise_rows if row["module"] == module}
        for module in ("motor", "sensory", "mixed")
    }
    exercise_counts = {module: len(ids) for module, ids in active_exercise_ids.items()}
    completed = {
        module: len({row["exercise_id"] for row in rows if row["module"] == module and row["exercise_id"] in active_exercise_ids[module]})
        for module in ("motor", "sensory", "mixed")
    }
    completion = {
        module: min(100, round(completed[module] / max(exercise_counts.get(module, 1), 1) * 100))
        for module in ("motor", "sensory", "mixed")
    }
    overall = round(sum(completed.values()) / max(sum(exercise_counts.values()), 1) * 100)
    skill_progress = build_skill_progress(rows, exercise_rows)
    return {"child": child, "overall": overall, "total_sessions": len(rows), "skills": skills, "skill_progress": skill_progress, "module_completion": completion, "module_completed": completed, "recent": rows[-8:][::-1]}


@app.get("/api/progress/{child_id}")
def progress(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    return progress_data(child_id, user)


@app.get("/api/dashboard/{child_id}")
def dashboard(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    child = ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT id,exercise_id,module,score,duration_seconds,created_at FROM sessions WHERE child_id=? AND measurement_version=1 ORDER BY created_at", (child_id,)).fetchall()
        exercise_rows = [dict(row) for row in db.execute("SELECT id,module,skill,title,instruction FROM exercises WHERE is_active=1").fetchall()]

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
    for row in rows:
        by_module[row["module"]].append(row["score"])
    module_accuracy = {
        module: round(sum(scores) / len(scores)) if scores else 0
        for module, scores in ((name, by_module[name]) for name in ("motor", "sensory", "mixed"))
    }
    active_exercise_ids = {
        module: {row["id"] for row in exercise_rows if row["module"] == module}
        for module in ("motor", "sensory", "mixed")
    }
    exercise_counts = {module: len(ids) for module, ids in active_exercise_ids.items()}
    module_completed = {
        module: len({row["exercise_id"] for row in rows if row["module"] == module and row["exercise_id"] in active_exercise_ids[module]})
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
            scores = [row["score"] for row, row_day in parsed if row_day == day and row["module"] == module]
            point[module] = round(sum(scores) / len(scores)) if scores else None
        daily.append(point)
    current_week_scores = [row["score"] for row in week_rows]
    previous_week_start = week_start - timedelta(days=7)
    previous_week_scores = [row["score"] for row, day in parsed if previous_week_start <= day < week_start]
    current_average = round(sum(current_week_scores) / len(current_week_scores)) if current_week_scores else 0
    previous_average = round(sum(previous_week_scores) / len(previous_week_scores)) if previous_week_scores else 0
    total_seconds = sum(row["duration_seconds"] for row in rows)
    today_seconds = sum(row["duration_seconds"] for row in today_rows)
    week_seconds = sum(row["duration_seconds"] for row in week_rows)
    row_dicts = [dict(row) for row in rows]
    skill_progress = build_skill_progress(row_dicts, exercise_rows)
    practiced_skills = [item for item in skill_progress if item["sessions"] > 0]
    weakest_skill = min(practiced_skills, key=lambda item: item["value"]) if practiced_skills else None
    recommended_exercise = None
    if weakest_skill:
        completed_ids = {row["exercise_id"] for row in rows if row["exercise_id"] is not None}
        candidates = [item for item in exercise_rows if item.get("skill") == weakest_skill["skill"]]
        recommended_exercise = next((item for item in candidates if item["id"] not in completed_ids), candidates[0] if candidates else None)
    return {
        "child": child,
        "total_sessions": len(rows),
        "total_minutes": round(total_seconds / 60, 1),
        "today_sessions": len(today_rows),
        "today_minutes": round(today_seconds / 60, 1),
        "week_sessions": len(week_rows),
        "week_minutes": round(week_seconds / 60, 1),
        "streak_days": streak,
        "stars": sum(max(1, row["score"] // 20) for row in rows),
        "overall": round(sum(module_completed.values()) / max(sum(exercise_counts.values()), 1) * 100),
        "module_progress": module_accuracy,
        "module_accuracy": module_accuracy,
        "module_completion": module_completion,
        "module_completed": module_completed,
        "completed_exercise_ids": sorted({row["exercise_id"] for row in rows if row["exercise_id"] is not None}),
        "module_sessions": {module: len(by_module[module]) for module in ("motor", "sensory", "mixed")},
        "active_exercises": exercise_counts,
        "skill_progress": skill_progress,
        "weakest_skill": weakest_skill,
        "recommended_exercise": recommended_exercise,
        "progress_delta": current_average - previous_average,
        "daily": daily,
        "achievements": {
            "first_five": len(rows) >= 5,
            "good_listener": len(by_module["sensory"]) >= 5,
            "phrase_master": len(by_module["mixed"]) >= 5,
            "week_streak": streak >= 7,
        },
        "recent": [dict(row) for row in rows[-5:]][::-1],
    }


@app.get("/api/session-plan/{child_id}")
def session_plan(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    child = ensure_child_access(child_id, user)
    data = progress_data(child_id, user)
    practiced = [item for item in data["skill_progress"] if item["sessions"] > 0]
    focus = min(practiced, key=lambda item: item["value"])["skill"] if practiced else None
    with connect() as db:
        assigned = db.execute(
            """SELECT e.* FROM assigned_exercises a JOIN exercises e ON e.id=a.exercise_id
               WHERE a.child_id=? AND a.status='assigned' AND e.is_active=1 ORDER BY a.id LIMIT 2""",
            (child_id,),
        ).fetchall()
        all_exercises = db.execute("SELECT * FROM exercises WHERE is_active=1 ORDER BY difficulty,id").fetchall()
    selected: list[dict] = []
    seen: set[int] = set()
    for row in [*assigned, *all_exercises]:
        item = dict(row)
        if item["id"] in seen:
            continue
        if len(selected) < 1 and item["module"] != "motor":
            continue
        if focus and len(selected) == 1 and item.get("skill") != focus:
            continue
        selected.append(item)
        seen.add(item["id"])
        if len(selected) == 4:
            break
    if len(selected) < 3:
        for row in all_exercises:
            item = dict(row)
            if item["id"] not in seen:
                selected.append(item)
                seen.add(item["id"])
            if len(selected) == 4:
                break
    minutes = sum(2 + item["difficulty"] for item in selected)
    return {"child": child, "focus_skill": focus, "estimated_minutes": minutes, "exercises": selected}


@app.post("/api/learning-sessions", status_code=201)
def create_learning_session(payload: LearningSessionCreate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    unique_ids = list(dict.fromkeys(payload.exercise_ids))
    if len(unique_ids) != len(payload.exercise_ids):
        raise HTTPException(422, "В занятии не должно быть повторяющихся заданий")
    placeholders = ",".join("?" for _ in unique_ids)
    with connect() as db:
        exercises = db.execute(f"SELECT * FROM exercises WHERE is_active=1 AND id IN ({placeholders})", tuple(unique_ids)).fetchall()
        if len(exercises) != len(unique_ids):
            raise HTTPException(422, "Одно из заданий недоступно")
        cursor = db.execute(
            "INSERT INTO learning_sessions(child_id,status,exercise_ids,current_index,started_at) VALUES(?,'in_progress',?,0,?) RETURNING id",
            (payload.child_id, json.dumps(unique_ids), now_iso()),
        )
        session_id = cursor.fetchone()["id"]
    by_id = {row["id"]: dict(row) for row in exercises}
    return {"id": session_id, "child_id": payload.child_id, "status": "in_progress", "current_index": 0, "started_at": now_iso(), "exercises": [by_id[item_id] for item_id in unique_ids]}


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
        result_rows = db.execute("SELECT exercise_id,score,duration_seconds,created_at FROM sessions WHERE learning_session_id=? AND measurement_version=1 ORDER BY sequence_index,id", (session_id,)).fetchall()
    by_id = {row["id"]: dict(row) for row in exercise_rows}
    return {**dict(session), "exercise_ids": exercise_ids, "exercises": [by_id[item_id] for item_id in exercise_ids if item_id in by_id], "results": [dict(row) for row in result_rows]}


@app.get("/api/ai/recommendations/{child_id}")
def recommendations(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    data = progress_data(child_id, user)
    practiced = [item for item in data["skill_progress"] if item["sessions"] > 0]
    if not practiced:
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(), "confidence": None,
            "insufficient_data": True, "suggested_skill": None, "suggested_exercise": None,
            "summary": "Пока недостаточно выполненных заданий для персональной рекомендации. Начните с короткого вводного занятия.",
            "plan": ["Пройти 3 коротких задания", "Завершить на успешной попытке"],
            "disclaimer": "Рекомендация носит информационный характер и должна быть согласована со специалистом.",
        }
    weakest = min(practiced, key=lambda item: item["value"])
    with connect() as db:
        exercise_row = db.execute("SELECT id,title,instruction,module,skill FROM exercises WHERE is_active=1 AND skill=? ORDER BY difficulty,id LIMIT 1", (weakest["skill"],)).fetchone()
    exercise = dict(exercise_row) if exercise_row else None
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confidence": min(94, 55 + weakest["sessions"] * 5),
        "insufficient_data": False,
        "suggested_skill": weakest["skill"],
        "suggested_exercise": exercise,
        "summary": f"В последних результатах больше практики требует навык «{weakest['label']}». Это учебная подсказка, а не медицинский вывод.",
        "plan": [exercise["title"] if exercise else weakest["recommended_practice"], weakest["recommended_practice"], "Закончить занятие на успешной попытке"],
        "disclaimer": "Рекомендация носит информационный характер и должна быть согласована со специалистом.",
    }


@app.post("/api/ai/recommendations/{child_id}/generate", status_code=201)
def generate_recommendation(child_id: int, user: dict = Depends(require_roles("specialist"))) -> dict:
    data = recommendations(child_id, user)
    if data["insufficient_data"]:
        return data
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO specialist_recommendations(child_id,specialist_id,suggested_skill,exercise_id,source,status,comment,created_at)
               VALUES(?,?,?,?,?,'pending',?,?) RETURNING id""",
            (child_id, user["id"], data["suggested_skill"], data["suggested_exercise"]["id"] if data["suggested_exercise"] else None, "ai_rules", data["summary"], now_iso()),
        )
        recommendation_id = cursor.fetchone()["id"]
        db.execute(
            "INSERT INTO usage_events(user_id,child_id,provider,model,feature,input_tokens,output_tokens,estimated_cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (user["id"], child_id, "local", "Söyle Rules v2", "Предложение для специалиста", 0, 0, 0, now_iso()),
        )
    return {**data, "recommendation_id": recommendation_id, "status": "pending"}


@app.get("/api/specialist/children/{child_id}")
def specialist_child(child_id: int, user: dict = Depends(require_roles("specialist"))) -> dict:
    dashboard_data = dashboard(child_id, user)
    with connect() as db:
        assigned = db.execute(
            """SELECT a.*,e.title,e.module,e.skill FROM assigned_exercises a JOIN exercises e ON e.id=a.exercise_id
               WHERE a.child_id=? AND a.specialist_id=? ORDER BY a.id DESC""", (child_id, user["id"]),
        ).fetchall()
        reviews = db.execute(
            """SELECT r.*,e.title exercise_title FROM specialist_recommendations r LEFT JOIN exercises e ON e.id=r.exercise_id
               WHERE r.child_id=? AND r.specialist_id=? ORDER BY r.id DESC LIMIT 10""", (child_id, user["id"]),
        ).fetchall()
    return {"dashboard": dashboard_data, "assigned_exercises": [dict(row) for row in assigned], "recommendations": [dict(row) for row in reviews]}


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
    return dict(row)


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
def create_specialist_assignment(payload: SpecialistAssignmentCreate, _: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        specialist = db.execute("SELECT id FROM users WHERE id=? AND role='specialist' AND is_active=1", (payload.specialist_id,)).fetchone()
        child = db.execute("SELECT id FROM children WHERE id=?", (payload.child_id,)).fetchone()
        if not specialist or not child:
            raise HTTPException(422, "Проверьте специалиста и профиль ребёнка")
        db.execute(
            "INSERT INTO specialist_children(specialist_id,child_id,assigned_at) VALUES(?,?,?) ON CONFLICT(specialist_id,child_id) DO NOTHING",
            (payload.specialist_id, payload.child_id, now_iso()),
        )
        row = db.execute("SELECT * FROM specialist_children WHERE specialist_id=? AND child_id=?", (payload.specialist_id, payload.child_id)).fetchone()
    return dict(row)


@app.delete("/api/admin/specialist-assignments/{specialist_id}/{child_id}", status_code=204)
def delete_specialist_assignment(specialist_id: int, child_id: int, _: dict = Depends(require_roles("admin"))):
    with connect() as db:
        db.execute("DELETE FROM specialist_children WHERE specialist_id=? AND child_id=?", (specialist_id, child_id))


@app.get("/api/admin/stats")
def admin_stats(_: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        return {
            "users": db.execute("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM student_accounts) count").fetchone()["count"],
            "children": db.execute("SELECT COUNT(*) count FROM children").fetchone()["count"],
            "sessions": db.execute("SELECT COUNT(*) count FROM sessions WHERE measurement_version=1").fetchone()["count"],
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
    return {"period_days": days, "requests": totals["requests"], "input_tokens": totals["input_tokens"], "output_tokens": totals["output_tokens"], "total_tokens": totals["input_tokens"] + totals["output_tokens"], "estimated_cost_usd": round(totals["cost"], 6), "breakdown": [dict(row) for row in breakdown], "recent": [dict(row) for row in recent], "note": "MediaPipe выполняется локально и не расходует токены. Стоимость облачных моделей будет рассчитана при их подключении."}


@app.patch("/api/admin/users/{user_id}/role")
def update_role(user_id: int, payload: RoleUpdate, admin: dict = Depends(require_roles("admin"))) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(400, "Нельзя изменить собственную роль")
    with connect() as db:
        db.execute("UPDATE users SET role=? WHERE id=?", (payload.role, user_id))
        row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Пользователь не найден")
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

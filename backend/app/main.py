import json
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .database import connect, init_db, now_iso
from .schemas import ActiveUpdate, ChildCreate, ExerciseCreate, LoginRequest, RegisterRequest, RoleUpdate, SessionCreate, StudentAccountCreate, StudentLoginRequest
from .security import create_access_token, create_student_access_token, get_current_user, hash_password, require_roles, verify_password


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Söyle API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    return dict(child)


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
            "INSERT INTO users(email,username,password_hash,full_name,role,created_at) VALUES(?,?,?,?,?,?)",
            (f"{username}@local.soyle", username, hash_password(payload.password), payload.full_name, "parent", now_iso()),
        )
        user_id = cursor.lastrowid
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
    try:
        date.fromisoformat(payload.birth_date)
    except ValueError:
        raise HTTPException(422, "Дата должна быть в формате YYYY-MM-DD")
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO children(parent_id,name,birth_date,primary_module,avatar_color) VALUES(?,?,?,?,?)",
            (user["id"], payload.name, payload.birth_date, payload.primary_module, payload.avatar_color),
        )
        row = db.execute("SELECT * FROM children WHERE id=?", (cursor.lastrowid,)).fetchone()
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


@app.post("/api/sessions", status_code=201)
def create_session(payload: SessionCreate, user: dict = Depends(get_current_user)) -> dict:
    ensure_child_access(payload.child_id, user)
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO sessions(child_id,exercise_id,module,score,duration_seconds,details,measurement_version,created_at) VALUES(?,?,?,?,?,?,1,?)",
            (payload.child_id, payload.exercise_id, payload.module, payload.score, payload.duration_seconds, json.dumps(payload.details, ensure_ascii=False), now_iso()),
        )
        row = db.execute("SELECT * FROM sessions WHERE id=?", (cursor.lastrowid,)).fetchone()
        if payload.module == "motor" and payload.details.get("source") == "face-landmarker":
            db.execute("INSERT INTO usage_events(user_id,child_id,provider,model,feature,created_at) VALUES(?,?,?,?,?,?)", (user["id"], payload.child_id, "local", "MediaPipe Face Landmarker", "Анализ артикуляции", now_iso()))
    result = dict(row)
    result["details"] = json.loads(result["details"])
    result["awarded_stars"] = max(1, payload.score // 20)
    return result


def progress_data(child_id: int, user: dict) -> dict:
    child = ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT * FROM sessions WHERE child_id=? AND measurement_version=1 ORDER BY created_at", (child_id,)).fetchall()
    by_module: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        by_module[row["module"]].append(row["score"])
    labels = {"motor": "Артикуляция", "sensory": "Понимание речи", "mixed": "Построение фраз"}
    skills = [{"module": module, "label": labels[module], "value": round(sum(by_module[module]) / len(by_module[module])) if by_module[module] else 0, "sessions": len(by_module[module])} for module in ("motor", "sensory", "mixed")]
    overall = round(sum(item["value"] for item in skills) / 3)
    return {"child": child, "overall": overall, "total_sessions": len(rows), "skills": skills, "recent": [dict(row) for row in rows[-8:]][::-1]}


@app.get("/api/progress/{child_id}")
def progress(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    return progress_data(child_id, user)


@app.get("/api/dashboard/{child_id}")
def dashboard(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    child = ensure_child_access(child_id, user)
    with connect() as db:
        rows = db.execute("SELECT id,module,score,duration_seconds,created_at FROM sessions WHERE child_id=? AND measurement_version=1 ORDER BY created_at", (child_id,)).fetchall()
        exercise_rows = db.execute("SELECT module,COUNT(*) count FROM exercises WHERE is_active=1 GROUP BY module").fetchall()

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
    exercise_counts = {row["module"]: row["count"] for row in exercise_rows}
    module_completion = {
        module: min(100, round(len(by_module[module]) / max(exercise_counts.get(module, 1), 1) * 100))
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
        "overall": round(sum(module_accuracy.values()) / 3),
        "module_progress": module_accuracy,
        "module_accuracy": module_accuracy,
        "module_completion": module_completion,
        "module_sessions": {module: len(by_module[module]) for module in ("motor", "sensory", "mixed")},
        "active_exercises": exercise_counts,
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


@app.get("/api/ai/recommendations/{child_id}")
def recommendations(child_id: int, user: dict = Depends(get_current_user)) -> dict:
    data = progress_data(child_id, user)
    weakest = min(data["skills"], key=lambda item: item["value"])
    module_text = {
        "motor": ("артикуляции", "Чередование «улыбка — трубочка»", "2 подхода по 3 минуты"),
        "sensory": ("понимании речи", "Слова из темы «Еда и напитки»", "повторить 5 знакомых слов"),
        "mixed": ("построении фраз", "Шаблон «Я хочу + предмет»", "собрать 4 короткие просьбы"),
    }
    focus, exercise, goal = module_text[weakest["module"]]
    input_tokens = 60 + data["total_sessions"] * 6
    output_tokens = 38
    with connect() as db:
        db.execute("INSERT INTO usage_events(user_id,child_id,provider,model,feature,input_tokens,output_tokens,estimated_cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?,?)", (user["id"], child_id, "local", "Söyle Rules v1", "Персональная рекомендация", input_tokens, output_tokens, 0, now_iso()))
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confidence": min(96, 68 + data["total_sessions"] * 3),
        "summary": f"Сейчас полезнее сделать акцент на {focus}. Задания подобраны по результатам {data['total_sessions']} занятий.",
        "focus_module": weakest["module"],
        "plan": [exercise, goal, "Закончить занятие на успешной попытке"],
        "disclaimer": "Рекомендация носит информационный характер и должна быть согласована со специалистом.",
    }


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
    with connect() as db:
        totals = db.execute("SELECT COUNT(*) requests,COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(estimated_cost_usd),0) cost FROM usage_events WHERE created_at >= datetime('now', ?)", (f"-{days} days",)).fetchone()
        breakdown = db.execute("SELECT provider,model,feature,COUNT(*) requests,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(estimated_cost_usd) cost FROM usage_events WHERE created_at >= datetime('now', ?) GROUP BY provider,model,feature ORDER BY requests DESC", (f"-{days} days",)).fetchall()
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
    with connect() as db:
        cursor = db.execute("INSERT INTO exercises(module,title,instruction,difficulty,target,icon,is_active) VALUES(?,?,?,?,?,?,?)", (payload.module, payload.title, payload.instruction, payload.difficulty, payload.target, payload.icon, int(payload.is_active)))
        row = db.execute("SELECT * FROM exercises WHERE id=?", (cursor.lastrowid,)).fetchone()
    return dict(row)


@app.put("/api/admin/exercises/{exercise_id}")
def update_exercise(exercise_id: int, payload: ExerciseCreate, _: dict = Depends(require_roles("admin"))) -> dict:
    with connect() as db:
        db.execute("UPDATE exercises SET module=?,title=?,instruction=?,difficulty=?,target=?,icon=?,is_active=? WHERE id=?", (payload.module, payload.title, payload.instruction, payload.difficulty, payload.target, payload.icon, int(payload.is_active), exercise_id))
        row = db.execute("SELECT * FROM exercises WHERE id=?", (exercise_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Упражнение не найдено")
    return dict(row)


@app.delete("/api/admin/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, _: dict = Depends(require_roles("admin"))):
    with connect() as db:
        db.execute("UPDATE exercises SET is_active=0 WHERE id=?", (exercise_id,))

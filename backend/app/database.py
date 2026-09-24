import os
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

DB_PATH = Path(os.getenv("SOYLE_DB_PATH", Path(__file__).resolve().parents[1] / "soyle.db"))

def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

EXERCISES = [
    ("motor", "Широкая улыбка", "Улыбнись широко и удерживай движение", 1, "smile", "/illustrations/module-articulation-fox.png"),
    ("motor", "Губы трубочкой", "Вытяни губы вперёд, будто задуваешь свечу", 1, "tube", "/illustrations/module-articulation-fox.png"),
    ("motor", "Окошко", "Открой рот и удерживай нижнюю челюсть спокойно", 2, "open", "/illustrations/module-articulation-fox.png"),
    ("motor", "Заборчик", "Покажи зубы в спокойной улыбке", 2, "teeth", "/illustrations/module-articulation-fox.png"),
    ("motor", "Воздушный шар", "Надуй обе щёки и удерживай воздух", 3, "cheeks", "/illustrations/module-articulation-fox.png"),
    ("motor", "Чередование", "Сделай улыбку, затем трубочку", 3, "sequence", "/illustrations/module-articulation-fox.png"),
    ("sensory", "Домашние животные", "Послушай слово и выбери животное", 1, "animals", "/illustrations/cat.png"),
    ("sensory", "Еда и напитки", "Найди названный продукт", 1, "food", "/illustrations/apple.png"),
    ("sensory", "Игрушки", "Послушай и выбери нужную игрушку", 1, "toys", "/illustrations/ball.png"),
    ("sensory", "Действия", "Соедини глагол с картинкой", 2, "actions", "/illustrations/module-listening.png"),
    ("sensory", "Признаки", "Различай большой, маленький, горячий и холодный", 2, "qualities", "/illustrations/module-listening.png"),
    ("sensory", "Два шага", "Выполни короткую инструкцию из двух действий", 3, "commands", "/illustrations/module-listening.png"),
    ("mixed", "Я хочу", "Собери просьбу из трёх карточек", 1, "request", "/illustrations/juice.png"),
    ("mixed", "Я вижу", "Расскажи, что находится рядом", 1, "observation", "/illustrations/see.png"),
    ("mixed", "Мне нравится", "Составь фразу о предпочтениях", 2, "preference", "/illustrations/love.png"),
    ("mixed", "Моя семья", "Собери предложение о близких", 2, "family", "/illustrations/module-phrases.png"),
    ("mixed", "Как я себя чувствую", "Выбери эмоцию и расскажи о ней", 2, "feelings", "/illustrations/module-phrases.png"),
    ("mixed", "Мой день", "Составь последовательность из четырёх карточек", 3, "routine", "/illustrations/module-phrases.png"),
]

def init_db() -> None:
    from .security import hash_password
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
            username TEXT UNIQUE, password_hash TEXT NOT NULL, full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','parent','specialist')),
            is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS children (
            id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL, birth_date TEXT NOT NULL, primary_module TEXT NOT NULL DEFAULT 'mixed',
            avatar_color TEXT NOT NULL DEFAULT '#f07d68'
        );
        CREATE TABLE IF NOT EXISTS student_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            child_id INTEGER NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
            username TEXT NOT NULL UNIQUE,
            pin_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT NOT NULL CHECK(module IN ('motor','sensory','mixed')),
            title TEXT NOT NULL, instruction TEXT NOT NULL, difficulty INTEGER NOT NULL DEFAULT 1,
            target TEXT NOT NULL, icon TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL, module TEXT NOT NULL,
            score INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, details TEXT NOT NULL DEFAULT '{}',
            measurement_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            child_id INTEGER REFERENCES children(id) ON DELETE SET NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            feature TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            estimated_cost_usd REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            user_key TEXT PRIMARY KEY,
            camera_enabled INTEGER NOT NULL DEFAULT 1,
            sound_enabled INTEGER NOT NULL DEFAULT 1,
            calm_mode INTEGER NOT NULL DEFAULT 0,
            theme TEXT NOT NULL DEFAULT 'peach',
            updated_at TEXT NOT NULL
        );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        if "username" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN username TEXT")
        db.execute("UPDATE users SET username=lower(substr(email,1,instr(email,'@')-1)) WHERE username IS NULL OR username='' ")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        session_columns = {row["name"] for row in db.execute("PRAGMA table_info(sessions)")}
        if "measurement_version" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN measurement_version INTEGER NOT NULL DEFAULT 0")
        if not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            created = now_iso()
            db.executemany("INSERT INTO users(email,username,password_hash,full_name,role,created_at) VALUES(?,?,?,?,?,?)", [
                ("admin@local.soyle", "admin", hash_password("Admin123!"), "Администратор Söyle", "admin", created),
                ("parent@local.soyle", "parent", hash_password("Parent123!"), "Айгерим Садыкова", "parent", created),
                ("specialist@local.soyle", "specialist", hash_password("Specialist123!"), "Гульнар Ким", "specialist", created),
            ])
            parent_id = db.execute("SELECT id FROM users WHERE username='parent'").fetchone()["id"]
            db.execute("INSERT INTO children(parent_id,name,birth_date,primary_module,avatar_color) VALUES(?,?,?,?,?)", (parent_id, "Алихан", date(2020, 4, 12).isoformat(), "mixed", "#f07d68"))
        if not db.execute("SELECT 1 FROM student_accounts LIMIT 1").fetchone():
            child_id = db.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()["id"]
            db.execute("INSERT INTO student_accounts(child_id,username,pin_hash,created_at) VALUES(?,?,?,?)", (child_id, "alikhan", hash_password("1234"), now_iso()))
        if not db.execute("SELECT 1 FROM exercises LIMIT 1").fetchone():
            db.executemany("INSERT INTO exercises(module,title,instruction,difficulty,target,icon) VALUES(?,?,?,?,?,?)", EXERCISES)
        icon_by_target = {exercise[4]: exercise[5] for exercise in EXERCISES}
        db.executemany("UPDATE exercises SET icon=? WHERE target=?", [(icon, target) for target, icon in icon_by_target.items()])
        if not db.execute("SELECT 1 FROM usage_events LIMIT 1").fetchone():
            child_id = db.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()["id"]
            db.executemany("INSERT INTO usage_events(child_id,provider,model,feature,input_tokens,output_tokens,estimated_cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?)", [
                (child_id, "local", "MediaPipe Face Landmarker", "Анализ артикуляции", 0, 0, 0, now_iso()),
                (child_id, "local", "Söyle Rules v1", "Персональная рекомендация", 82, 41, 0, now_iso()),
            ])

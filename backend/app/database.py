import os
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # PostgreSQL driver is only required when DATABASE_URL is set.
    psycopg = None
    dict_row = None

DB_PATH = Path(os.getenv("SOYLE_DB_PATH", Path(__file__).resolve().parents[1] / "soyle.db"))
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()


class DatabaseConnection:
    def __init__(self):
        if DATABASE_URL:
            if psycopg is None:
                raise RuntimeError("psycopg is required when DATABASE_URL is configured")
            self.backend = "postgresql"
            self.connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        else:
            self.backend = "sqlite"
            self.connection = sqlite3.connect(DB_PATH, check_same_thread=False)
            self.connection.row_factory = sqlite3.Row
            self.connection.execute("PRAGMA foreign_keys = ON")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        try:
            if exc_type is None:
                self.connection.commit()
            else:
                self.connection.rollback()
        finally:
            self.connection.close()

    def _query(self, query: str) -> str:
        return query.replace("?", "%s") if self.backend == "postgresql" else query

    def execute(self, query: str, params: tuple[Any, ...] | list[Any] = ()):
        return self.connection.execute(self._query(query), params)

    def executemany(self, query: str, params):
        cursor = self.connection.cursor()
        cursor.executemany(self._query(query), params)
        return cursor

    def executescript(self, script: str) -> None:
        if self.backend == "sqlite":
            self.connection.executescript(script)
            return
        for statement in script.split(";"):
            if statement.strip():
                self.connection.execute(statement)


def connect() -> DatabaseConnection:
    return DatabaseConnection()

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def env_enabled(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

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
    ("mixed", "Попросить помощь", "Собери и озвучь фразу, когда тебе нужна помощь", 1, "help", "/illustrations/mascot-parrot-headphones.png"),
    ("mixed", "Сказать о желании", "Сообщи, чего ты хочешь прямо сейчас", 1, "desire", "/illustrations/want.png"),
    ("mixed", "Сообщить о необходимости", "Скажи о важной потребности: пить, отдохнуть или сходить в туалет", 1, "need", "/illustrations/juice.png"),
]

AAC_CARDS = [
    ("Помоги", "Помоги мне", "help", "/illustrations/mascot-parrot-headphones.png", 1),
    ("Больно", "Мне больно", "help", "/illustrations/love.png", 1),
    ("Перерыв", "Мне нужен перерыв", "help", "/illustrations/mascot-parrot.png", 1),
    ("Не хочу", "Я не хочу", "help", "/illustrations/me.png", 1),
    ("Ещё", "Я хочу ещё", "wants", "/illustrations/want.png", 1),
    ("Хочу", "Я хочу", "wants", "/illustrations/want.png", 1),
    ("Пить", "Я хочу пить", "needs", "/illustrations/juice.png", 1),
    ("Есть", "Я хочу есть", "needs", "/illustrations/apple.png", 1),
    ("Туалет", "Мне нужно в туалет", "needs", "/illustrations/me.png", 1),
    ("Отдых", "Я хочу отдохнуть", "needs", "/illustrations/mascot-parrot.png", 1),
    ("Я", "Я", "people", "/illustrations/me.png", 0),
    ("Мама", "Мама", "people", "/illustrations/mom.png", 0),
    ("Папа", "Папа", "people", "/illustrations/dad.png", 0),
    ("Сок", "сок", "food", "/illustrations/juice.png", 0),
    ("Яблоко", "яблоко", "food", "/illustrations/apple.png", 0),
    ("Мяч", "мяч", "play", "/illustrations/ball.png", 0),
    ("Кот", "кот", "play", "/illustrations/cat.png", 0),
    ("Люблю", "люблю", "actions", "/illustrations/love.png", 0),
    ("Вижу", "вижу", "actions", "/illustrations/see.png", 0),
]

def init_db() -> None:
    from .security import hash_password
    with connect() as db:
        id_column = "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY" if db.backend == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"
        db.executescript(f"""
        CREATE TABLE IF NOT EXISTS users (
            id {id_column}, email TEXT NOT NULL UNIQUE,
            username TEXT UNIQUE, password_hash TEXT NOT NULL, full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','parent','specialist')),
            is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS children (
            id {id_column}, parent_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL, birth_date TEXT NOT NULL, primary_module TEXT NOT NULL DEFAULT 'mixed',
            avatar_color TEXT NOT NULL DEFAULT '#f07d68'
        );
        CREATE TABLE IF NOT EXISTS student_accounts (
            id {id_column},
            child_id BIGINT NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
            username TEXT NOT NULL UNIQUE,
            pin_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS exercises (
            id {id_column}, module TEXT NOT NULL CHECK(module IN ('motor','sensory','mixed')),
            title TEXT NOT NULL, instruction TEXT NOT NULL, difficulty INTEGER NOT NULL DEFAULT 1,
            target TEXT NOT NULL, icon TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id {id_column}, child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            exercise_id BIGINT REFERENCES exercises(id) ON DELETE SET NULL, module TEXT NOT NULL,
            score INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, details TEXT NOT NULL DEFAULT '{{}}',
            measurement_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usage_events (
            id {id_column},
            user_id BIGINT,
            child_id BIGINT REFERENCES children(id) ON DELETE SET NULL,
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
        CREATE TABLE IF NOT EXISTS aac_cards (
            id {id_column},
            child_id BIGINT REFERENCES children(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            speech TEXT NOT NULL,
            category TEXT NOT NULL,
            image TEXT NOT NULL,
            is_core INTEGER NOT NULL DEFAULT 0,
            created_by BIGINT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS aac_favorites (
            child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            card_id BIGINT NOT NULL REFERENCES aac_cards(id) ON DELETE CASCADE,
            PRIMARY KEY(child_id,card_id)
        );
        CREATE TABLE IF NOT EXISTS aac_phrase_history (
            id {id_column},
            child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            user_key TEXT NOT NULL,
            phrase TEXT NOT NULL,
            card_ids TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id {id_column},
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            event_key TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            metadata TEXT NOT NULL DEFAULT '{{}}',
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        """)
        if db.backend == "postgresql":
            columns = {row["column_name"] for row in db.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'").fetchall()}
        else:
            columns = {row["name"] for row in db.execute("PRAGMA table_info(users)").fetchall()}
        if "username" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN username TEXT")
        username_expression = "lower(split_part(email,'@',1))" if db.backend == "postgresql" else "lower(substr(email,1,instr(email,'@')-1))"
        db.execute(f"UPDATE users SET username={username_expression} WHERE username IS NULL OR username='' ")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        if db.backend == "postgresql":
            session_columns = {row["column_name"] for row in db.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions'").fetchall()}
        else:
            session_columns = {row["name"] for row in db.execute("PRAGMA table_info(sessions)").fetchall()}
        if "measurement_version" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN measurement_version INTEGER NOT NULL DEFAULT 0")

        seed_demo = env_enabled("SOYLE_SEED_DEMO_DATA", default=not bool(DATABASE_URL))
        if seed_demo and not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            created = now_iso()
            db.executemany("INSERT INTO users(email,username,password_hash,full_name,role,created_at) VALUES(?,?,?,?,?,?)", [
                ("admin@local.soyle", "admin", hash_password("Admin123!"), "Администратор Söyle", "admin", created),
                ("parent@local.soyle", "parent", hash_password("Parent123!"), "Айгерим Садыкова", "parent", created),
                ("specialist@local.soyle", "specialist", hash_password("Specialist123!"), "Гульнар Ким", "specialist", created),
            ])
            parent_id = db.execute("SELECT id FROM users WHERE username='parent'").fetchone()["id"]
            db.execute("INSERT INTO children(parent_id,name,birth_date,primary_module,avatar_color) VALUES(?,?,?,?,?)", (parent_id, "Алихан", date(2020, 4, 12).isoformat(), "mixed", "#f07d68"))

        admin_username = os.getenv("SOYLE_ADMIN_USERNAME", "").strip().lower()
        admin_password = os.getenv("SOYLE_ADMIN_PASSWORD", "")
        if admin_username and admin_password and not db.execute("SELECT 1 FROM users WHERE role='admin' LIMIT 1").fetchone():
            db.execute(
                "INSERT INTO users(email,username,password_hash,full_name,role,created_at) VALUES(?,?,?,?,?,?)",
                (f"{admin_username}@local.soyle", admin_username, hash_password(admin_password), os.getenv("SOYLE_ADMIN_NAME", "Администратор Söyle"), "admin", now_iso()),
            )

        if seed_demo and not db.execute("SELECT 1 FROM student_accounts LIMIT 1").fetchone():
            child_id = db.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()["id"]
            db.execute("INSERT INTO student_accounts(child_id,username,pin_hash,created_at) VALUES(?,?,?,?)", (child_id, "alikhan", hash_password("1234"), now_iso()))
        existing_targets = {row["target"] for row in db.execute("SELECT target FROM exercises").fetchall()}
        missing_exercises = [exercise for exercise in EXERCISES if exercise[4] not in existing_targets]
        if missing_exercises:
            db.executemany("INSERT INTO exercises(module,title,instruction,difficulty,target,icon) VALUES(?,?,?,?,?,?)", missing_exercises)
        icon_by_target = {exercise[4]: exercise[5] for exercise in EXERCISES}
        db.executemany("UPDATE exercises SET icon=? WHERE target=?", [(icon, target) for target, icon in icon_by_target.items()])
        if not db.execute("SELECT 1 FROM aac_cards WHERE child_id IS NULL LIMIT 1").fetchone():
            db.executemany(
                "INSERT INTO aac_cards(child_id,label,speech,category,image,is_core,created_at) VALUES(NULL,?,?,?,?,?,?)",
                [(*card, now_iso()) for card in AAC_CARDS],
            )
        if seed_demo and not db.execute("SELECT 1 FROM usage_events LIMIT 1").fetchone():
            child_id = db.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()["id"]
            db.executemany("INSERT INTO usage_events(child_id,provider,model,feature,input_tokens,output_tokens,estimated_cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?)", [
                (child_id, "local", "MediaPipe Face Landmarker", "Анализ артикуляции", 0, 0, 0, now_iso()),
                (child_id, "local", "Söyle Rules v1", "Персональная рекомендация", 82, 41, 0, now_iso()),
            ])

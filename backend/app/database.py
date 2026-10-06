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
    ("sensory", "Домашние животные", "Послушай слово и выбери подходящее животное", 1, "animals", "/illustrations/cat.png"),
    ("sensory", "Еда и напитки", "Послушай слово и найди названный продукт", 1, "food", "/illustrations/apple.png"),
    ("sensory", "Игрушки", "Послушай слово и выбери названную игрушку", 1, "toys", "/illustrations/ball.png"),
    ("sensory", "Части тела", "Послушай слово и покажи нужную часть тела", 1, "body", "/illustrations/me.png"),
    ("sensory", "Одежда", "Послушай слово и выбери предмет одежды", 1, "clothes", "/illustrations/module-listening.png"),
    ("sensory", "Предметы дома", "Найди предмет, который назван", 1, "household", "/illustrations/module-listening.png"),
    ("sensory", "Действия", "Послушай глагол и выбери подходящее действие", 2, "actions", "/illustrations/module-listening.png"),
    ("sensory", "Признаки предметов", "Послушай признак и выбери подходящую картинку", 2, "qualities", "/illustrations/module-listening.png"),
    ("sensory", "Где находится предмет", "Различай слова «на», «в» и «под»", 2, "location", "/illustrations/module-listening.png"),
    ("sensory", "Места вокруг нас", "Послушай слово и выбери названное место", 2, "places", "/illustrations/module-listening.png"),
    ("sensory", "Противоположности", "Найди картинку по словам «большой», «маленький», «горячий» и «холодный»", 2, "opposites", "/illustrations/module-listening.png"),
    ("sensory", "Инструкции из двух шагов", "Послушай инструкцию и выбери правильную последовательность действий", 3, "commands", "/illustrations/module-listening.png"),
    ("mixed", "Я хочу", "Собери понятную просьбу из двух или трёх карточек", 1, "request", "/illustrations/juice.png"),
    ("mixed", "Я вижу", "Собери фразу о том, что находится рядом", 1, "observation", "/illustrations/see.png"),
    ("mixed", "Мне нравится", "Составь фразу о своём предпочтении", 2, "preference", "/illustrations/love.png"),
    ("mixed", "Моя семья", "Собери короткое сообщение о близком человеке", 2, "family", "/illustrations/module-phrases.png"),
    ("mixed", "Как я себя чувствую", "Выбери карточку состояния и сообщи о нём", 2, "feelings", "/illustrations/module-phrases.png"),
    ("mixed", "Мой день", "Составь последовательность событий дня", 3, "routine", "/illustrations/module-phrases.png"),
    ("mixed", "Попросить помощь", "Собери и озвучь фразу, когда тебе нужна помощь", 1, "help", "/illustrations/mascot-parrot-headphones.png"),
    ("mixed", "Сказать о желании", "Сообщи, чего ты хочешь прямо сейчас", 1, "desire", "/illustrations/want.png"),
    ("mixed", "Сообщить о необходимости", "Скажи о важной потребности: пить, отдохнуть или сходить в туалет", 1, "need", "/illustrations/juice.png"),
    ("mixed", "Сказать «нет»", "Сообщи об отказе спокойно и понятно", 1, "refusal", "/illustrations/me.png"),
    ("mixed", "Сделать выбор", "Выбери один из двух вариантов и сообщи о выборе", 1, "choice", "/illustrations/want.png"),
    ("mixed", "Поздороваться", "Собери короткое приветствие для знакомого человека", 1, "greeting", "/illustrations/mom.png"),
    ("mixed", "Ответить «да» или «нет»", "Выбери понятный ответ на короткий вопрос", 1, "answer", "/illustrations/love.png"),
    ("mixed", "Кто и что делает", "Собери фразу из человека и действия", 2, "agent_action", "/illustrations/module-phrases.png"),
    ("mixed", "Где находится предмет", "Собери фразу с предлогом «на», «в» или «под»", 2, "spatial_phrase", "/illustrations/see.png"),
    ("mixed", "Спросить о предмете", "Собери короткий вопрос «Что это?» или «Где мяч?»", 2, "question", "/illustrations/module-phrases.png"),
    ("mixed", "Рассказать о событии", "Собери короткое сообщение о том, что произошло", 3, "past_event", "/illustrations/module-phrases.png"),
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
    ("Да", "Да", "yes_no", "/illustrations/love.png", 1),
    ("Нет", "Нет", "yes_no", "/illustrations/me.png", 1),
    ("Весело", "Мне весело", "feelings", "/illustrations/mascot-parrot-headphones.png", 0),
    ("Грустно", "Мне грустно", "feelings", "/illustrations/me.png", 0),
    ("Домой", "Я хочу домой", "places", "/illustrations/mom.png", 0),
    ("Привет", "Привет", "people", "/illustrations/mascot-parrot-headphones.png", 1),
    ("Бабушка", "Бабушка", "people", "/illustrations/mom.png", 0),
    ("Вода", "воду", "food", "/illustrations/juice.png", 0),
    ("Банан", "банан", "food", "/illustrations/apple.png", 0),
    ("Машинка", "машинку", "play", "/illustrations/ball.png", 0),
    ("Кукла", "куклу", "play", "/illustrations/mascot-parrot.png", 0),
    ("Иду", "иду", "actions", "/illustrations/me.png", 0),
    ("Играю", "играю", "actions", "/illustrations/ball.png", 0),
    ("Устал", "Я устал", "feelings", "/illustrations/me.png", 1),
    ("Спокойно", "Мне спокойно", "feelings", "/illustrations/mascot-parrot.png", 0),
    ("Школа", "Я хочу в школу", "places", "/illustrations/module-phrases.png", 0),
    ("Площадка", "Я хочу на площадку", "places", "/illustrations/ball.png", 0),
    ("Где?", "Где", "places", "/illustrations/see.png", 1),
    ("На столе", "на столе", "places", "/illustrations/module-phrases.png", 0),
    ("В коробке", "в коробке", "places", "/illustrations/module-phrases.png", 0),
    ("Под стулом", "под стулом", "places", "/illustrations/module-phrases.png", 0),
    ("Что это?", "Что это?", "actions", "/illustrations/see.png", 1),
    ("Вчера", "Вчера", "actions", "/illustrations/module-phrases.png", 0),
    ("Играл", "играл", "actions", "/illustrations/ball.png", 0),
    ("Гулял", "гулял", "actions", "/illustrations/me.png", 0),
    ("Хлеб", "хлеб", "food", "/illustrations/apple.png", 0),
    ("Суп", "суп", "food", "/illustrations/juice.png", 0),
    ("Каша", "кашу", "food", "/illustrations/juice.png", 0),
    ("Чай", "чай", "food", "/illustrations/juice.png", 0),
    ("Книга", "книгу", "play", "/illustrations/module-phrases.png", 0),
    ("Пазл", "пазл", "play", "/illustrations/ball.png", 0),
    ("Рисовать", "рисовать", "actions", "/illustrations/module-phrases.png", 0),
    ("Читать", "читать", "actions", "/illustrations/module-phrases.png", 0),
    ("Спать", "спать", "actions", "/illustrations/mascot-parrot.png", 0),
    ("Гулять", "гулять", "actions", "/illustrations/me.png", 0),
    ("Злюсь", "Я злюсь", "feelings", "/illustrations/me.png", 0),
    ("Страшно", "Мне страшно", "feelings", "/illustrations/me.png", 1),
    ("Жарко", "Мне жарко", "feelings", "/illustrations/mascot-parrot-headphones.png", 0),
    ("Холодно", "Мне холодно", "feelings", "/illustrations/mascot-parrot.png", 0),
    ("Магазин", "Я хочу в магазин", "places", "/illustrations/module-phrases.png", 0),
    ("Детский сад", "Я хочу в детский сад", "places", "/illustrations/module-phrases.png", 0),
    ("Дедушка", "Дедушка", "people", "/illustrations/dad.png", 0),
    ("Брат", "Брат", "people", "/illustrations/me.png", 0),
    ("Сестра", "Сестра", "people", "/illustrations/me.png", 0),
]

SKILL_BY_TARGET = {
    "smile": "articulation", "tube": "articulation", "open": "articulation",
    "teeth": "articulation", "cheeks": "articulation", "sequence": "articulation",
    "animals": "vocabulary", "food": "vocabulary", "toys": "vocabulary", "qualities": "vocabulary",
    "body": "vocabulary", "clothes": "vocabulary", "household": "vocabulary", "places": "vocabulary",
    "actions": "speech_comprehension", "commands": "speech_comprehension", "opposites": "speech_comprehension", "location": "speech_comprehension",
    "observation": "word_repetition", "family": "word_repetition", "greeting": "word_repetition", "answer": "word_repetition",
    "request": "phrase_building", "preference": "phrase_building", "routine": "phrase_building", "agent_action": "phrase_building", "spatial_phrase": "phrase_building", "question": "phrase_building", "past_event": "phrase_building",
    "help": "communication", "desire": "communication", "need": "communication", "feelings": "communication", "refusal": "communication", "choice": "communication",
}

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
            target TEXT NOT NULL, icon TEXT NOT NULL, skill TEXT, is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS learning_sessions (
            id {id_column}, child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'in_progress', exercise_ids TEXT NOT NULL DEFAULT '[]',
            current_index INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id {id_column}, child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            exercise_id BIGINT REFERENCES exercises(id) ON DELETE SET NULL, module TEXT NOT NULL,
            score INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, details TEXT NOT NULL DEFAULT '{{}}',
            measurement_version INTEGER NOT NULL DEFAULT 1,
            learning_session_id BIGINT REFERENCES learning_sessions(id) ON DELETE SET NULL,
            sequence_index INTEGER, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS specialist_children (
            specialist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            assigned_at TEXT NOT NULL, PRIMARY KEY(specialist_id,child_id)
        );
        CREATE TABLE IF NOT EXISTS assigned_exercises (
            id {id_column}, child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            specialist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            exercise_id BIGINT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
            note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'assigned',
            created_at TEXT NOT NULL, completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS specialist_recommendations (
            id {id_column}, child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            specialist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            suggested_skill TEXT NOT NULL, exercise_id BIGINT REFERENCES exercises(id) ON DELETE SET NULL,
            source TEXT NOT NULL DEFAULT 'specialist', status TEXT NOT NULL DEFAULT 'pending',
            comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, reviewed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
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
            language TEXT NOT NULL DEFAULT 'ru',
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
        CREATE TABLE IF NOT EXISTS child_goals (
            id {id_column},
            child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            specialist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            target_skill TEXT NOT NULL,
            due_date TEXT,
            success_criterion TEXT NOT NULL,
            difficulty INTEGER NOT NULL DEFAULT 1,
            exercise_ids TEXT NOT NULL DEFAULT '[]',
            position INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS homework_assignments (
            id {id_column},
            child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            specialist_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            goal_id BIGINT REFERENCES child_goals(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            instruction TEXT NOT NULL,
            due_date TEXT,
            result TEXT,
            parent_note TEXT NOT NULL DEFAULT '',
            completed_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS child_consents (
            child_id BIGINT PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
            parent_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            privacy_accepted INTEGER NOT NULL DEFAULT 0,
            camera_processing INTEGER NOT NULL DEFAULT 0,
            specialist_sharing INTEGER NOT NULL DEFAULT 1,
            version TEXT NOT NULL DEFAULT '2026-10',
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_attempts (
            id {id_column}, identifier TEXT NOT NULL, successful INTEGER NOT NULL DEFAULT 0,
            attempted_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_attempts_identifier ON auth_attempts(identifier,attempted_at);
        CREATE TABLE IF NOT EXISTS audit_events (
            id {id_column}, actor_key TEXT NOT NULL, action TEXT NOT NULL,
            object_type TEXT NOT NULL, object_id TEXT, metadata TEXT NOT NULL DEFAULT '{{}}',
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
        if db.backend == "postgresql":
            exercise_columns = {row["column_name"] for row in db.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises'").fetchall()}
        else:
            exercise_columns = {row["name"] for row in db.execute("PRAGMA table_info(exercises)").fetchall()}
        if "skill" not in exercise_columns:
            db.execute("ALTER TABLE exercises ADD COLUMN skill TEXT")
        if "learning_session_id" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN learning_session_id BIGINT REFERENCES learning_sessions(id) ON DELETE SET NULL")
        if "sequence_index" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN sequence_index INTEGER")
        if "independence" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN independence INTEGER")
        if "prompt_level" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN prompt_level TEXT")
        if "response_ms" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN response_ms INTEGER")
        if "communication_initiatives" not in session_columns:
            db.execute("ALTER TABLE sessions ADD COLUMN communication_initiatives INTEGER NOT NULL DEFAULT 0")
        if db.backend == "postgresql":
            learning_columns = {row["column_name"] for row in db.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_sessions'").fetchall()}
        else:
            learning_columns = {row["name"] for row in db.execute("PRAGMA table_info(learning_sessions)").fetchall()}
        if "target_minutes" not in learning_columns:
            db.execute("ALTER TABLE learning_sessions ADD COLUMN target_minutes INTEGER NOT NULL DEFAULT 5")
        if "paused_at" not in learning_columns:
            db.execute("ALTER TABLE learning_sessions ADD COLUMN paused_at TEXT")
        if db.backend == "postgresql":
            settings_columns = {row["column_name"] for row in db.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings'").fetchall()}
        else:
            settings_columns = {row["name"] for row in db.execute("PRAGMA table_info(user_settings)").fetchall()}
        if "language" not in settings_columns:
            db.execute("ALTER TABLE user_settings ADD COLUMN language TEXT NOT NULL DEFAULT 'ru'")
        db.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(1,?) ON CONFLICT(version) DO NOTHING", (now_iso(),))
        db.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(2,?) ON CONFLICT(version) DO NOTHING", (now_iso(),))

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
        if seed_demo and not db.execute("SELECT 1 FROM specialist_children LIMIT 1").fetchone():
            specialist = db.execute("SELECT id FROM users WHERE role='specialist' ORDER BY id LIMIT 1").fetchone()
            child = db.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()
            if specialist and child:
                db.execute("INSERT INTO specialist_children(specialist_id,child_id,assigned_at) VALUES(?,?,?)", (specialist["id"], child["id"], now_iso()))
        existing_targets = {row["target"] for row in db.execute("SELECT target FROM exercises").fetchall()}
        missing_exercises = [exercise for exercise in EXERCISES if exercise[4] not in existing_targets]
        if missing_exercises:
            db.executemany("INSERT INTO exercises(module,title,instruction,difficulty,target,icon) VALUES(?,?,?,?,?,?)", missing_exercises)
        db.executemany(
            "UPDATE exercises SET module=?,title=?,instruction=?,difficulty=?,icon=? WHERE target=?",
            [(module, title, instruction, difficulty, icon, target) for module, title, instruction, difficulty, target, icon in EXERCISES],
        )
        db.executemany("UPDATE exercises SET skill=? WHERE target=?", [(skill, target) for target, skill in SKILL_BY_TARGET.items()])
        existing_cards = {(row["label"], row["category"]) for row in db.execute("SELECT label,category FROM aac_cards WHERE child_id IS NULL").fetchall()}
        missing_cards = [card for card in AAC_CARDS if (card[0], card[2]) not in existing_cards]
        if missing_cards:
            db.executemany(
                "INSERT INTO aac_cards(child_id,label,speech,category,image,is_core,created_at) VALUES(NULL,?,?,?,?,?,?)",
                [(*card, now_iso()) for card in missing_cards],
            )
        if seed_demo and not db.execute("SELECT 1 FROM usage_events LIMIT 1").fetchone():
            child_id = db.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()["id"]
            db.executemany("INSERT INTO usage_events(child_id,provider,model,feature,input_tokens,output_tokens,estimated_cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?)", [
                (child_id, "local", "MediaPipe Face Landmarker", "Анализ артикуляции", 0, 0, 0, now_iso()),
                (child_id, "local", "Söyle Rules v1", "Персональная рекомендация", 0, 0, 0, now_iso()),
            ])

"""Disposable local server used only by Playwright.

The module refuses to delete any database except the fixed test path.
"""

from pathlib import Path

import uvicorn

from . import database
from .database import connect, init_db, now_iso
from .migrations import apply_migrations


TEST_DATABASE = Path("/tmp/soyle-playwright.db")


def main() -> None:
    if database.DB_PATH.resolve() != TEST_DATABASE.resolve():
        raise RuntimeError("Playwright server requires SOYLE_DB_PATH=/tmp/soyle-playwright.db")
    if TEST_DATABASE.exists():
        TEST_DATABASE.unlink()
    init_db()
    apply_migrations()
    with connect() as db:
        child = db.execute("SELECT id,parent_id FROM children ORDER BY id LIMIT 1").fetchone()
        if child:
            stamp = now_iso()
            db.execute(
                """INSERT INTO child_consents(
                       child_id,parent_id,privacy_accepted,camera_processing,specialist_sharing,
                       ai_processing,analytics_processing,consented_by_user_id,
                       privacy_accepted_at,version,updated_at)
                   VALUES(?,?,1,0,0,0,0,?,?, '2026-10',?)
                   ON CONFLICT(child_id) DO UPDATE SET
                       privacy_accepted=1,privacy_accepted_at=excluded.privacy_accepted_at,
                       updated_at=excluded.updated_at""",
                (child["id"], child["parent_id"], child["parent_id"], stamp, stamp),
            )
    from .main import app

    uvicorn.run(app, host="127.0.0.1", port=8011, log_level="warning")


if __name__ == "__main__":
    main()

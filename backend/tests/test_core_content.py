from copy import deepcopy
from pathlib import Path

from app.core_content import WORD_CORE, ACTION_CORE
from app.database import connect
from app.exercise_engine import validate_version
from app import exercise_engine
from app.practice_goals import _related_exercises
from app.migrations import _insert_p15_draft
import pytest


def test_core_has_complete_local_examples_and_honest_method_card():
    assert validate_version({**WORD_CORE, "language": "ru"}) == []
    root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    paths = set()
    for stimulus in WORD_CORE["content"]["stimuli"]:
        for path in [stimulus["media_ref"], *stimulus["exemplars"]]:
            assert (root / path.lstrip("/")).stat().st_size > 1000
            paths.add(path)
    assert len(paths) == 8
    assert WORD_CORE["method_card"]["sources"]
    assert WORD_CORE["method_card"]["methodology_review_status"] == "pending"


def test_remote_and_duplicate_examples_are_rejected():
    for examples in (["https://example.com/x.png"], ["//example.com/x.png"], ["/../x.png"], [WORD_CORE["content"]["stimuli"][0]["media_ref"]], "wrong"):
        version = deepcopy(WORD_CORE)
        version["content"]["stimuli"][0]["exemplars"] = examples
        assert any("примеры" in error for error in validate_version({**version, "language": "ru"}))


def test_action_core_has_four_distinct_local_scenes_and_rejects_ambiguous_hold():
    assert validate_version({**ACTION_CORE, "language": "ru"}) == []
    stimuli = ACTION_CORE["content"]["stimuli"]
    assert {item["key"] for item in stimuli} == {"eat", "drink", "read", "play"}
    assert len({item["media_ref"] for item in stimuli}) == 4
    root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    assert all((root / item["media_ref"].lstrip("/")).stat().st_size > 1000 for item in stimuli)
    assert "не включена" in ACTION_CORE["method_card"]["ambiguities"][0]


def test_core_appends_a_draft_and_cannot_escape_review_gate(client, admin_headers, student_headers, monkeypatch):
    drafts = client.get("/api/admin/exercise-drafts", headers=admin_headers).json()
    core = next(item for item in drafts if item["version"]["target"] == WORD_CORE["target"])
    assert core["valid"] and core["can_publish"]
    version = core["version"]
    assert version["publication_status"] == "draft"
    assert version["methodology_status"] == "pending"
    assert client.post(f'/api/admin/exercise-drafts/{version["id"]}/publish', headers=student_headers).status_code == 403
    monkeypatch.setattr(exercise_engine, "ALLOW_UNREVIEWED_DEMO_CONTENT", False)
    public = client.get("/api/exercises", headers=student_headers).json()
    assert version["id"] not in {item["engine"]["version_id"] for item in public}
    with connect() as db:
        old = db.execute("SELECT id FROM exercise_versions WHERE exercise_id=? AND version<?", (version["exercise_id"], version["version"])).fetchall()
    assert old, "The old version must remain alongside the new draft"


def test_goal_link_and_rollback_in_a_disposable_copy_of_synthetic_database(client, parent_headers, monkeypatch, tmp_path):
    import sqlite3
    from app import database

    if database.DATABASE_URL:
        pytest.skip("SQLite disposable-copy rollback fixture; PostgreSQL gates are covered by API tests")

    copied = tmp_path / "release-fixture.db"
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(copied) as destination:
        source.backup(destination)
    monkeypatch.setattr(database, "DB_PATH", copied)
    monkeypatch.setattr(exercise_engine, "ALLOW_UNREVIEWED_DEMO_CONTENT", False)
    templates = client.get("/api/practice-goal-templates", headers=parent_headers).json()
    template = next(item for item in templates if item["template_key"] == "recognise-familiar-examples")
    assert template["matching_targets"] == ["household"]
    # These are simulated completed reviews in a disposable synthetic fixture,
    # not reviewer permissions or approvals in any user environment.
    with connect() as db:
        first = db.execute("SELECT id,exercise_id FROM exercise_versions WHERE title=?", (WORD_CORE["title"],)).fetchone()
        db.execute("UPDATE exercise_versions SET review_status='approved',technical_status='passed',methodology_status='approved',accessibility_status='approved',release_status='approved' WHERE id=?", (first["id"],))
        exercise_engine.publish_version(db, first["id"])
        linked = _related_exercises(db, template)
        assert any(item["exercise_version_id"] == first["id"] for item in linked)
        _insert_p15_draft(db, {**WORD_CORE, "title": "Synthetic reviewed successor for rollback"})
        second = db.execute("SELECT id FROM exercise_versions WHERE title='Synthetic reviewed successor for rollback'").fetchone()["id"]
        db.execute("UPDATE exercise_versions SET review_status='approved',technical_status='passed',methodology_status='approved',accessibility_status='approved',release_status='approved' WHERE id=?", (second,))
        exercise_engine.publish_version(db, second)
        assert exercise_engine.published_exercise(db, first["exercise_id"])["engine"]["version_id"] == second
        exercise_engine.publish_version(db, first["id"])
        assert exercise_engine.published_exercise(db, first["exercise_id"])["engine"]["version_id"] == first["id"]


def test_passport_revision_appends_without_rewriting_an_existing_draft(client, monkeypatch, tmp_path):
    import sqlite3
    from app import database
    from app.migrations import _migration_23_core_passport_alignment
    if database.DATABASE_URL:
        pytest.skip("SQLite migration-copy fixture")
    copied = tmp_path / "old-core-revision.db"
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(copied) as destination:
        source.backup(destination)
    monkeypatch.setattr(database, "DB_PATH", copied)
    old_fixture = deepcopy(WORD_CORE)
    old_fixture["content"]["revision"] = "synthetic-previous-core-revision"
    with connect() as db:
        _insert_p15_draft(db, old_fixture)
        previous = dict(db.execute("SELECT id,exercise_id,content_json,method_card_json FROM exercise_versions WHERE title=? ORDER BY version DESC LIMIT 1", (WORD_CORE["title"],)).fetchone())
        count = db.execute("SELECT count(*) n FROM exercise_versions").fetchone()["n"]
        _migration_23_core_passport_alignment(db)
        assert db.execute("SELECT count(*) n FROM exercise_versions").fetchone()["n"] == count + 2
        retained = dict(db.execute("SELECT id,exercise_id,content_json,method_card_json FROM exercise_versions WHERE id=?", (previous["id"],)).fetchone())
        assert retained == previous
        _migration_23_core_passport_alignment(db)
        assert db.execute("SELECT count(*) n FROM exercise_versions").fetchone()["n"] == count + 2

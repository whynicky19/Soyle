from audio_fixtures import approve_fixture_version
from pathlib import Path

from app.database import connect
from app import exercise_engine


P15_TARGETS = {
    "p15-nouns-toys",
    "p15-nouns-food",
    "p15-nouns-animals",
    "p15-nouns-clothing",
    "p15-nouns-home",
    "p15-nouns-body",
    "p15-actions-core",
    "p15-instructions-one-step",
}

METHOD_FIELDS = {
    "target_skill",
    "skill_group",
    "intended_for",
    "diagnosis_boundary",
    "prerequisites",
    "stimuli_and_responses",
    "child_instruction",
    "adult_guidance",
    "accepted_responses",
    "difficulty_levels",
    "prompts",
    "ambiguities",
    "stop_conditions",
    "result_registration",
    "real_life_transfer",
    "sources",
    "evidence_note",
    "methodology_review_status",
}


def _p15_drafts(client, admin_headers):
    response = client.get("/api/admin/exercise-drafts", headers=admin_headers)
    assert response.status_code == 200, response.text
    return {
        item["version"]["target"]: item
        for item in response.json()
        if item["version"]["target"] in P15_TARGETS
    }


def test_p15_library_is_complete_structured_and_stays_draft(client, parent_headers, admin_headers):
    public_targets = {item["target"] for item in client.get("/api/exercises", headers=parent_headers).json()}
    assert P15_TARGETS.isdisjoint(public_targets)

    drafts = _p15_drafts(client, admin_headers)
    assert set(drafts) == P15_TARGETS
    assert all(item["valid"] is True and item["can_publish"] is True for item in drafts.values())
    assert all(item["version"]["publication_status"] == "draft" for item in drafts.values())
    assert all(item["version"]["methodology_status"] == "pending" for item in drafts.values())
    assert all(METHOD_FIELDS <= set(item["version"]["method_card"]) for item in drafts.values())
    assert all(item["version"]["method_card"]["methodology_review_status"] == "pending" for item in drafts.values())

    noun_drafts = [drafts[target] for target in P15_TARGETS if target.startswith("p15-nouns-")]
    assert len(noun_drafts) == 6
    assert sum(len(item["version"]["content"]["stimuli"]) for item in noun_drafts) == 72
    for item in noun_drafts:
        content = item["version"]["content"]
        assert len(content["stimuli"]) == 12
        assert {level["option_count"] for level in content["difficulty_levels"]} == {2, 3, 4}
        assert all(stimulus["hint"] and stimulus["alt"] and stimulus["media_ref"].endswith((".webp", ".png")) for stimulus in content["stimuli"])

    animal_media = {
        item["label"]: item["media_ref"]
        for item in drafts["p15-nouns-animals"]["version"]["content"]["stimuli"]
    }
    assert animal_media["Кролик"] == "/app-illustrations/exercise-stimulus-rabbit.webp"
    assert animal_media["Рыба"] == "/app-illustrations/exercise-stimulus-fish.webp"
    assert animal_media["Птица"] == "/app-illustrations/exercise-stimulus-bird.webp"
    assert animal_media["Кот"] == "/app-illustrations/exercise-stimulus-cat.webp"
    assert animal_media["Собака"] == "/app-illustrations/exercise-stimulus-dog.webp"
    assert animal_media["Черепаха"] == "/app-illustrations/exercise-stimulus-turtle.webp"

    actions = drafts["p15-actions-core"]["version"]["content"]["stimuli"]
    assert len(actions) == 12
    assert {item["label"] for item in actions} == {"Ест", "Пьёт", "Спит", "Идёт", "Бежит", "Сидит", "Стоит", "Моет руки", "Играет с мячом", "Смотрит книгу", "Рисует", "Хлопает в ладоши"}
    assert all(item["media_ref"].endswith((".webp", ".png")) and item["alt"] for item in actions)

    scenarios = drafts["p15-instructions-one-step"]["version"]["content"]["scenarios"]
    assert len(scenarios) == 24
    assert {item["result"]["relation"] for item in scenarios} == {"in", "on"}
    assert all(len(item["objects"]) == 4 for item in scenarios)
    assert all(item["success"]["object_key"] != item["success"]["target_key"] for item in scenarios)


def test_p15_assets_are_local_present_and_have_provenance(client, admin_headers):
    drafts = _p15_drafts(client, admin_headers)
    public_root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    media_refs = set()
    for draft in drafts.values():
        registry = draft["version"]["content"]["asset_registry"]
        assert registry
        for asset in registry:
            media_refs.add(asset["media_ref"])
            assert asset["media_ref"].startswith("/")
            assert asset["origin"]
            assert asset["license"]
            assert asset["license_status"] == "documented"
            assert (public_root / asset["media_ref"].lstrip("/")).is_file(), asset["media_ref"]
    with connect() as db:
        registered = {row["media_ref"] for row in db.execute("SELECT media_ref FROM content_assets").fetchall()}
    assert media_refs <= registered


def test_admin_review_needs_no_separate_expert_permissions(client, admin_headers, parent_headers, monkeypatch, tmp_path):
    from app import database
    import sqlite3
    if database.DATABASE_URL:
        import pytest
        pytest.skip("Disposable SQLite publication fixture")
    copied = tmp_path / "admin-review.db"
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(copied) as destination:
        source.backup(destination)
    monkeypatch.setattr(database, "DB_PATH", copied)
    monkeypatch.setattr(exercise_engine, "ALLOW_UNREVIEWED_DEMO_CONTENT", False)
    draft = _p15_drafts(client, admin_headers)["p15-nouns-toys"]
    version_id = draft["version"]["id"]
    assert client.get("/api/admin/content-review/capabilities", headers=admin_headers).json() == {"admin_review": True}
    assert client.post(f"/api/admin/exercise-drafts/{version_id}/publish", headers=parent_headers).status_code == 403
    returned = client.post(f"/api/admin/exercise-drafts/{version_id}/reviews", headers=admin_headers,
        json={"stage": "admin", "decision": "changes_requested", "comment": "Проверить озвучку до выпуска"})
    assert returned.status_code == 200
    assert returned.json()["version"]["admin_review_status"] == "changes_requested"
    approve_fixture_version(version_id)
    published = client.post(f"/api/admin/exercise-drafts/{version_id}/publish", headers=admin_headers,
        json={"comment": "Картинки, инструкция, звук и ответы проверены"})
    assert published.status_code == 200, published.text
    assert published.json()["admin_review_status"] == "approved"
    assert published.json()["methodology_status"] == "pending"
    history = client.get(f"/api/admin/exercise-drafts/{version_id}/preview", headers=admin_headers).json()["reviews"]
    assert [item["stage"] for item in history[-2:]] == ["admin", "admin"]
    assert history[-1]["reviewer_name"] and history[-1]["comment"]
    assert version_id in {item["engine"]["version_id"] for item in client.get("/api/exercises", headers=parent_headers).json()}
    assert client.post(f"/api/admin/exercise-drafts/{version_id}/publish", headers=admin_headers).status_code == 409


def test_legacy_publications_are_blocked_when_demo_mode_is_disabled(client):
    with connect() as db:
        demo_rows = exercise_engine.published_exercise_rows(db)
    assert demo_rows
    assert all(item["engine"]["review_gate"]["demo_only"] for item in demo_rows)
    original = exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT
    try:
        exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT = False
        with connect() as db:
            rows = exercise_engine.published_exercise_rows(db)
        assert rows == []
    finally:
        exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT = original


def test_twelve_home_games_are_review_gated_without_leaking_instructions(client, parent_headers, admin_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    family = client.get(f"/api/home-activities/{child_id}", headers=parent_headers)
    assert family.status_code == 200
    assert family.json()["activities"] == []
    assert len(family.json()["pending_review"]) == 12
    assert all("objective" not in item and "materials" not in item and "method_card" not in item for item in family.json()["pending_review"])

    admin = client.get("/api/admin/home-activity-drafts", headers=admin_headers)
    assert admin.status_code == 200
    assert len(admin.json()) == 12
    assert all(item["method_card"]["methodology_review_status"] == "pending" for item in admin.json())
    assert {item["activity_key"] for item in admin.json()} >= {
        "choose-clothes", "shared-reading", "dishes-play", "search-familiar-items",
        "ask-more", "use-no-stop", "describe-actions",
    }

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
    assert all(item["valid"] is True and item["can_publish"] is False for item in drafts.values())
    assert all(item["version"]["publication_status"] == "draft" for item in drafts.values())
    assert all(item["version"]["methodology_status"] == "pending" for item in drafts.values())
    assert all(METHOD_FIELDS <= set(item["version"]["method_card"]) for item in drafts.values())
    assert all(item["version"]["method_card"]["methodology_review_status"] == "pending" for item in drafts.values())

    noun_drafts = [drafts[target] for target in P15_TARGETS if target.startswith("p15-nouns-")]
    assert len(noun_drafts) == 6
    assert sum(len(item["version"]["content"]["stimuli"]) for item in noun_drafts) == 36
    for item in noun_drafts:
        content = item["version"]["content"]
        assert len(content["stimuli"]) == 6
        assert {level["option_count"] for level in content["difficulty_levels"]} == {2, 3, 4}
        assert all(stimulus["hint"] and stimulus["alt"] and stimulus["media_ref"].endswith((".svg", ".png")) for stimulus in content["stimuli"])

    animal_media = {
        item["label"]: item["media_ref"]
        for item in drafts["p15-nouns-animals"]["version"]["content"]["stimuli"]
    }
    assert animal_media["Кролик"] == "/aac-pictograms/rabbit.png"
    assert animal_media["Рыба"] == "/aac-pictograms/fish.png"
    assert animal_media["Птица"] == "/aac-pictograms/bird.png"
    assert animal_media["Кот"] == "/aac-pictograms/cat.png"
    assert animal_media["Собака"] == "/aac-pictograms/dog.png"
    assert animal_media["Черепаха"] == "/aac-pictograms/turtle.png"

    actions = drafts["p15-actions-core"]["version"]["content"]["stimuli"]
    assert len(actions) == 10
    assert {item["label"] for item in actions} == {"Ест", "Пьёт", "Спит", "Идёт", "Бежит", "Сидит", "Стоит", "Моет", "Играет", "Читает"}
    assert all(item["media_ref"].endswith(".svg") and item["alt"] for item in actions)

    scenarios = drafts["p15-instructions-one-step"]["version"]["content"]["scenarios"]
    assert len(scenarios) == 10
    assert {item["category"] for item in scenarios} == {"take", "give", "in", "on", "next_to"}
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


def test_review_stages_require_independent_permissions_and_keep_history(client, admin_headers):
    draft = _p15_drafts(client, admin_headers)["p15-nouns-toys"]
    version_id = draft["version"]["id"]
    capabilities = client.get("/api/admin/content-review/capabilities", headers=admin_headers)
    assert capabilities.status_code == 200
    assert capabilities.json() == {"technical_review": True, "methodology_review": False, "accessibility_review": False, "release_approval": False}

    too_early = client.post(
        f"/api/admin/exercise-drafts/{version_id}/reviews",
        headers=admin_headers,
        json={"stage": "methodology", "decision": "approved", "comment": "Методика проверена вручную"},
    )
    assert too_early.status_code == 403

    technical = client.post(
        f"/api/admin/exercise-drafts/{version_id}/reviews",
        headers=admin_headers,
        json={"stage": "technical", "decision": "passed", "comment": "Изображения, звук и runner проверены вручную"},
    )
    assert technical.status_code == 200, technical.text
    assert technical.json()["version"]["technical_status"] == "passed"

    admin_id = client.get("/api/auth/me", headers=admin_headers).json()["id"]
    try:
        with connect() as db:
            db.execute(
                """INSERT INTO content_reviewer_permissions(
                       user_id,can_methodology_review,can_accessibility_review,can_release_approve,granted_by,granted_at)
                   VALUES(?,1,1,1,?,datetime('now'))""",
                (admin_id, admin_id),
            )
        methodology = client.post(
            f"/api/admin/exercise-drafts/{version_id}/reviews",
            headers=admin_headers,
            json={"stage": "methodology", "decision": "approved", "comment": "Формулировки и иерархия подсказок проверены"},
        )
        assert methodology.status_code == 200, methodology.text
        accessibility = client.post(
            f"/api/admin/exercise-drafts/{version_id}/reviews",
            headers=admin_headers,
            json={"stage": "accessibility", "decision": "approved", "comment": "Клавиатура, screen reader и масштаб текста проверены"},
        )
        assert accessibility.status_code == 200, accessibility.text
        release = client.post(
            f"/api/admin/exercise-drafts/{version_id}/reviews",
            headers=admin_headers,
            json={"stage": "publication", "decision": "approved", "comment": "Версия разрешена к отдельной ручной публикации"},
        )
        assert release.status_code == 200, release.text
        assert release.json()["can_publish"] is True
        assert [item["stage"] for item in release.json()["reviews"]][-4:] == ["technical", "methodology", "accessibility", "publication"]
        assert all(item["comment"] for item in release.json()["reviews"][-4:])
    finally:
        with connect() as db:
            db.execute("DELETE FROM content_reviews WHERE version_id=? AND reviewer_id=?", (version_id, admin_id))
            db.execute("DELETE FROM content_reviewer_permissions WHERE user_id=?", (admin_id,))
            db.execute(
                """UPDATE exercise_versions SET technical_status='automated_passed',
                       methodology_status='pending',accessibility_status='pending',release_status='pending',review_status='pending'
                   WHERE id=?""",
                (version_id,),
            )


def test_legacy_publications_remain_available_and_marked_unreviewed_when_demo_mode_is_disabled(client):
    with connect() as db:
        demo_rows = exercise_engine.published_exercise_rows(db)
    assert demo_rows
    assert all(item["engine"]["review_gate"]["demo_only"] for item in demo_rows)
    original = exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT
    try:
        exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT = False
        with connect() as db:
            rows = exercise_engine.published_exercise_rows(db)
        assert {row["id"] for row in rows} == {row["id"] for row in demo_rows}
        assert all(row["engine"]["review_gate"]["demo_only"] for row in rows)
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

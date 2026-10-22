from pathlib import Path

from app import database
from app.database import connect
from app.migrations import apply_migrations, LATEST_SCHEMA_VERSION, MIGRATIONS


PARENT_CHILD_ATTEMPT = {
    "actor_role": "parent",
    "response_owner": "child",
    "support_context": "independent",
}


def _register_family(client, username: str) -> tuple[dict[str, str], int]:
    registered = client.post(
        "/api/auth/register",
        headers={"X-Soyle-Auth-Mode": "bearer"},
        json={"username": username, "password": "FamilyTest123!", "full_name": "Тестовый родитель"},
    )
    assert registered.status_code == 201, registered.text
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    child = client.post(
        "/api/children",
        headers=headers,
        json={"name": "Тестовый ребёнок", "birth_date": "2021-02-03", "primary_module": "mixed", "avatar_color": "#82a78f"},
    )
    assert child.status_code == 201, child.text
    child_id = child.json()["id"]
    consent = client.put(
        f"/api/children/{child_id}/consent",
        headers=headers,
        json={"privacy_accepted": True, "camera_processing": False, "ai_processing": False, "analytics_processing": False},
    )
    assert consent.status_code == 200, consent.text
    return headers, child_id


def test_p1_drafts_are_runnable_but_never_public_without_review(client, parent_headers, admin_headers):
    public_targets = {item["target"] for item in client.get("/api/exercises", headers=parent_headers).json()}
    assert "p1-word-runner-demo" not in public_targets
    assert "p1-simple-instructions-demo" not in public_targets
    assert "actions" not in public_targets

    drafts = client.get("/api/admin/exercise-drafts", headers=admin_headers)
    assert drafts.status_code == 200, drafts.text
    p1 = {
        item["version"]["target"]: item
        for item in drafts.json()
        if item["version"]["target"] in {"p1-word-runner-demo", "actions", "p1-simple-instructions-demo"}
    }
    assert set(p1) == {"p1-word-runner-demo", "actions", "p1-simple-instructions-demo"}
    assert {item["version"]["mechanic"] for item in p1.values()} == {"auditory_choice", "action_choice", "tap_instruction"}
    assert all(item["valid"] is True for item in p1.values())
    assert all(item["can_publish"] is False for item in p1.values())
    assert all(item["version"]["review_status"] == "pending" for item in p1.values())

    action_content = p1["actions"]["version"]["content"]
    assert all(stimulus["media_ref"].startswith("/p1/actions/") for stimulus in action_content["stimuli"])
    assert {level["option_count"] for level in action_content["difficulty_levels"]} == {2, 3, 4}
    instruction_content = p1["p1-simple-instructions-demo"]["version"]["content"]
    assert all(len(scenario["objects"]) >= 4 for scenario in instruction_content["scenarios"])
    assert all(scenario["success"]["object_key"] != scenario["success"]["target_key"] for scenario in instruction_content["scenarios"])

    for item in p1.values():
        blocked = client.post(f"/api/admin/exercise-drafts/{item['version']['id']}/publish", headers=admin_headers)
        assert blocked.status_code == 409


def test_skill_map_create_edit_and_family_isolation(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    initial = client.get(f"/api/observations/{child_id}", headers=parent_headers)
    assert initial.status_code == 200
    assert len(initial.json()) == 7
    assert all(item["status"] == "not_observed" for item in initial.json())

    created = client.put(
        f"/api/observations/{child_id}/instruction_comprehension",
        headers=parent_headers,
        json={"status": "with_help", "note": "Выполнил после повторения"},
    )
    assert created.status_code == 200, created.text
    assert created.json()["source"] == "real_life_parent_observation"
    updated = client.put(
        f"/api/observations/{child_id}/instruction_comprehension",
        headers=parent_headers,
        json={"status": "independent", "note": "Самостоятельно дома"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "independent"

    other_headers, other_child_id = _register_family(client, "p1isolatedfamily")
    assert client.get(f"/api/observations/{other_child_id}", headers=parent_headers).status_code == 403
    assert client.put(
        f"/api/observations/{child_id}/aac_use",
        headers=other_headers,
        json={"status": "with_help", "note": "Недопустимая запись"},
    ).status_code == 403


def test_home_activity_content_is_review_gated_and_observations_are_editable(client, parent_headers, admin_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    library = client.get(f"/api/home-activities/{child_id}", headers=parent_headers)
    assert library.status_code == 200, library.text
    assert library.json()["activities"] == []
    assert len(library.json()["pending_review"]) == 12
    pending_id = library.json()["pending_review"][0]["id"]
    blocked = client.post(
        f"/api/home-activities/{child_id}/observations",
        headers=parent_headers,
        json={"activity_id": pending_id, "outcome": "with_help", "prompt_level": "minimal", "note": "Черновик"},
    )
    assert blocked.status_code == 409

    admin_drafts = client.get("/api/admin/home-activity-drafts", headers=admin_headers)
    assert admin_drafts.status_code == 200
    assert len(admin_drafts.json()) == 12
    required = {"objective", "materials", "adult_instructions", "accepted_responses", "prompts", "stop_conditions"}
    assert all(required <= set(item) and all(item[field] for field in required) for item in admin_drafts.json())

    try:
        with connect() as db:
            db.execute(
                "UPDATE home_activity_templates SET review_status='approved',publication_status='published' WHERE id=?",
                (pending_id,),
            )
        published = client.get(f"/api/home-activities/{child_id}", headers=parent_headers).json()
        assert len(published["activities"]) == 1
        assert required <= set(published["activities"][0])

        created = client.post(
            f"/api/home-activities/{child_id}/observations",
            headers=parent_headers,
            json={"activity_id": pending_id, "outcome": "with_help", "prompt_level": "minimal", "note": "После указательного жеста"},
        )
        assert created.status_code == 201, created.text
        assert created.json()["source"] == "real_life_parent_observation"
        observation_id = created.json()["id"]
        edited = client.put(
            f"/api/home-activities/{child_id}/observations/{observation_id}",
            headers=parent_headers,
            json={"activity_id": pending_id, "outcome": "independent", "prompt_level": "independent", "note": "Получилось самостоятельно"},
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["outcome"] == "independent"
    finally:
        with connect() as db:
            db.execute(
                "UPDATE home_activity_templates SET review_status='pending',publication_status='draft' WHERE id=?",
                (pending_id,),
            )


def test_results_keep_choices_support_and_stop_outcomes_separate(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    exercise = client.get("/api/exercises?module=sensory", headers=parent_headers).json()[0]
    before = client.get(f"/api/results/{child_id}/summary", headers=parent_headers).json()

    completed = client.post(
        "/api/sessions",
        headers=parent_headers,
        json={
            **PARENT_CHILD_ATTEMPT,
            "child_id": child_id,
            "exercise_id": exercise["id"],
            "module": "sensory",
            "score": 100,
            "duration_seconds": 28,
            "details": {"difficulty_level": 2, "option_count": 3, "round_count": 4},
            "attempts_count": 4,
            "correct_answers": 3,
            "prompts_used": 2,
            "gameplay_choices": 6,
            "independent_completions": 2,
            "prompted_completions": 1,
            "attempt_status": "completed",
        },
    )
    assert completed.status_code == 201, completed.text
    assert completed.json()["score"] == 75
    for status in ("refused", "break", "technical_error"):
        saved = client.post(
            "/api/sessions",
            headers=parent_headers,
            json={
                **PARENT_CHILD_ATTEMPT,
                "child_id": child_id,
                "exercise_id": exercise["id"],
                "module": "sensory",
                "score": 99,
                "duration_seconds": 1,
                "details": {"reason": "test"},
                "attempt_status": status,
            },
        )
        assert saved.status_code == 201, saved.text
        assert saved.json()["score"] == 0

    after = client.get(f"/api/results/{child_id}/summary", headers=parent_headers).json()
    assert after["gameplay_choices"] - before["gameplay_choices"] == 6
    assert after["independent_completions"] - before["independent_completions"] == 2
    assert after["prompted_completions"] - before["prompted_completions"] == 1
    assert after["refusals"] - before["refusals"] == 1
    assert after["breaks"] - before["breaks"] == 1
    assert after["technical_errors"] - before["technical_errors"] == 1
    assert "не объединяются" in after["disclaimer"]


def test_all_migrations_upgrade_an_old_database_and_are_idempotent(tmp_path):
    original_path = database.DB_PATH
    original_url = database.DATABASE_URL
    database.DATABASE_URL = ""
    temporary_path = Path(tmp_path) / "soyle-p1-upgrade.db"
    database.DB_PATH = temporary_path
    try:
        database.init_db()
        with connect() as db:
            assert db.execute("SELECT MAX(version) version FROM schema_migrations").fetchone()["version"] == 8
        assert apply_migrations() == [version for version, *_ in MIGRATIONS if version > 8]
        assert apply_migrations() == []
        with connect() as db:
            assert db.execute("SELECT MAX(version) version FROM schema_migrations").fetchone()["version"] == LATEST_SCHEMA_VERSION
            tables = {row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            assert {"exercise_versions", "skill_observations", "home_activity_templates", "home_activity_observations", "content_reviews", "content_reviewer_permissions", "content_assets", "practice_goal_templates", "parent_practice_goals", "practice_goal_history", "practice_goal_observations", "adaptive_practice_plans", "adaptive_practice_plan_items"} <= tables
            assert {"child_world_photos", "child_story_progress", "storybook_progress"} <= tables
            session_columns = {row["name"] for row in db.execute("PRAGMA table_info(sessions)").fetchall()}
            assert {"exercise_version_id", "gameplay_choices", "independent_completions", "prompted_completions", "adaptive_plan_item_id", "actor_role", "response_owner", "support_context"} <= session_columns
            version_columns = {row["name"] for row in db.execute("PRAGMA table_info(exercise_versions)").fetchall()}
            assert "accessibility_status" in version_columns
            permission_columns = {row["name"] for row in db.execute("PRAGMA table_info(content_reviewer_permissions)").fetchall()}
            assert "can_accessibility_review" in permission_columns
            learning_columns = {row["name"] for row in db.execute("PRAGMA table_info(learning_sessions)").fetchall()}
            assert "adaptive_plan_id" in learning_columns
            assert db.execute("SELECT COUNT(*) count FROM practice_goal_templates").fetchone()["count"] == 7
            assert db.execute("SELECT matching_targets_json FROM practice_goal_templates WHERE template_key='recognise-familiar-examples'").fetchone()
            assert db.execute("SELECT COUNT(*) count FROM home_activity_templates").fetchone()["count"] == 12
            assert db.execute("SELECT COUNT(*) count FROM exercise_versions WHERE publication_status='draft'").fetchone()["count"] >= 11
    finally:
        database.DB_PATH = original_path
        database.DATABASE_URL = original_url

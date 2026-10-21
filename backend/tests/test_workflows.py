from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.aac_grammar import compose_aac_phrase
from app.database import connect
from app.main import app, auth_identifier, ensure_child_access


PARENT_CHILD_ATTEMPT = {
    "actor_role": "parent",
    "response_owner": "child",
    "support_context": "independent",
}


def test_health_reports_controlled_schema_migration(client):
    for path in ("/health", "/health/live"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == {"status": "alive", "service": "soyle-api"}
    for path in ("/api/health", "/health/ready"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "service": "soyle-api", "schema_version": 18, "required_schema_version": 18}


def test_readiness_is_non_2xx_when_schema_is_stale_but_liveness_remains_up(client):
    with connect() as db:
        applied_at = db.execute("SELECT applied_at FROM schema_migrations WHERE version=18").fetchone()["applied_at"]
        db.execute("DELETE FROM schema_migrations WHERE version=18")
    try:
        assert client.get("/health/live").status_code == 200
        response = client.get("/api/health")
        assert response.status_code == 503
        assert response.json()["status"] == "migration_required"
        assert response.json()["schema_version"] == 17
        assert response.json()["required_schema_version"] == 18
    finally:
        with connect() as db:
            db.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(18,?)", (applied_at,))


def test_cookie_session_csrf_origin_and_logout():
    with TestClient(app) as browser:
        login = browser.post("/api/auth/login", json={"username": "parent", "password": "Parent123!"})
        assert login.status_code == 200, login.text
        assert "access_token" not in login.json()
        assert browser.cookies.get("soyle_access")
        csrf_token = browser.cookies.get("soyle_csrf")
        assert csrf_token
        assert "HttpOnly" in login.headers["set-cookie"]
        assert "SameSite=lax" in login.headers["set-cookie"]
        assert login.headers["cache-control"] == "no-store"
        current = browser.get("/api/auth/me")
        assert current.status_code == 200
        assert current.json()["csrf_token"] == csrf_token

        payload = {"camera_enabled": False, "sound_enabled": True, "calm_mode": False, "theme": "peach", "language": "ru"}
        assert browser.put("/api/settings", json=payload).status_code == 403
        assert browser.put("/api/settings", headers={"X-CSRF-Token": csrf_token}, json=payload).status_code == 200
        assert browser.put("/api/settings", headers={"Origin": "https://attacker.invalid", "X-CSRF-Token": csrf_token}, json=payload).status_code == 403

        logout = browser.post("/api/auth/logout", headers={"X-CSRF-Token": csrf_token})
        assert logout.status_code == 204
        assert browser.get("/api/auth/me").status_code == 401


def test_login_identifier_isolated_by_client():
    assert auth_identifier("adult", "victim", "198.51.100.10") != auth_identifier("adult", "victim", "203.0.113.9")
    assert auth_identifier("adult", "victim", "198.51.100.10") != auth_identifier("adult", "other", "198.51.100.10")


def test_auth_roles_and_child_access(client, parent_headers, admin_headers):
    assert client.get("/api/admin/stats", headers=parent_headers).status_code == 403
    assert client.get("/api/admin/stats", headers=admin_headers).status_code == 200

    registration = client.post("/api/auth/register", headers={"X-Soyle-Auth-Mode": "bearer"}, json={
        "username": "secondparent", "password": "SecondParent123!", "full_name": "Второй родитель",
    })
    assert registration.status_code == 201
    other_headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    child = client.post("/api/children", headers=other_headers, json={
        "name": "Другой ребёнок", "birth_date": "2021-02-03", "primary_module": "mixed", "avatar_color": "#82a78f",
    })
    assert child.status_code == 201
    assert client.get(f"/api/dashboard/{child.json()['id']}", headers=parent_headers).status_code == 403


def test_session_attribution_blocks_adult_preview_and_separates_modelled_results(client, parent_headers):
    child = client.post("/api/children", headers=parent_headers, json={
        "name": "Атрибуция попыток", "birth_date": "2021-02-03", "primary_module": "sensory", "avatar_color": "#82a78f",
    }).json()
    child_id = child["id"]
    consent = client.put(f"/api/children/{child_id}/consent", headers=parent_headers, json={
        "privacy_accepted": True, "camera_processing": False, "ai_processing": False, "analytics_processing": True,
    })
    assert consent.status_code == 200, consent.text
    exercise = client.get("/api/exercises?module=sensory", headers=parent_headers).json()[0]
    base = {
        "child_id": child_id, "exercise_id": exercise["id"], "module": "sensory",
        "score": 100, "duration_seconds": 10, "details": {},
        "attempt_status": "completed", "attempts_count": 1, "correct_answers": 1,
    }

    preview = client.post("/api/sessions", headers=parent_headers, json={
        **base, "actor_role": "parent", "response_owner": "adult", "support_context": "adult_preview",
    })
    assert preview.status_code == 422
    mismatched_actor = client.post("/api/sessions", headers=parent_headers, json={
        **base, "actor_role": "student", "response_owner": "child", "support_context": "independent",
    })
    assert mismatched_actor.status_code == 403
    unattributed = client.post("/api/sessions", headers=parent_headers, json={
        **base, "actor_role": "parent", "response_owner": "unknown", "support_context": "unknown",
    })
    assert unattributed.status_code == 422

    modelled = client.post("/api/sessions", headers=parent_headers, json={
        **base, "score": 0, "correct_answers": 0, "prompt_level": "full",
        "actor_role": "parent", "response_owner": "child", "support_context": "caregiver_modelled",
    })
    assert modelled.status_code == 201, modelled.text
    assert modelled.json()["awarded_stars"] == 0
    supported = client.post("/api/sessions", headers=parent_headers, json={
        **base, "prompt_level": "minimal",
        "actor_role": "parent", "response_owner": "child", "support_context": "caregiver_supported",
    })
    assert supported.status_code == 201, supported.text

    with connect() as db:
        rows = [dict(row) for row in db.execute(
            "SELECT actor_role,response_owner,support_context FROM sessions WHERE child_id=? ORDER BY id", (child_id,),
        ).fetchall()]
    assert rows == [
        {"actor_role": "parent", "response_owner": "child", "support_context": "caregiver_modelled"},
        {"actor_role": "parent", "response_owner": "child", "support_context": "caregiver_supported"},
    ]
    metrics = client.get(f"/api/progress/{child_id}", headers=parent_headers).json()["support_metrics"]
    assert metrics["modelled_responses"] == 1
    assert metrics["game_result_average"] == 100


def test_student_session_requires_student_actor_and_independent_context(client, student_headers):
    child_id = client.get("/api/children", headers=student_headers).json()[0]["id"]
    exercise = client.get("/api/exercises?module=sensory", headers=student_headers).json()[0]
    base = {
        "child_id": child_id, "exercise_id": exercise["id"], "module": "sensory",
        "score": 100, "duration_seconds": 10, "details": {},
        "attempt_status": "completed", "attempts_count": 1, "correct_answers": 1,
        "actor_role": "student", "response_owner": "child",
    }
    supported = client.post("/api/sessions", headers=student_headers, json={**base, "support_context": "caregiver_supported"})
    assert supported.status_code == 422
    independent = client.post("/api/sessions", headers=student_headers, json={**base, "support_context": "independent"})
    assert independent.status_code == 201, independent.text
    assert independent.json()["actor_role"] == "student"


def test_login_rate_limit(client):
    for _ in range(5):
        response = client.post("/api/auth/login", json={"username": "rate-limited", "password": "wrong"})
        assert response.status_code == 401
    response = client.post("/api/auth/login", json={"username": "rate-limited", "password": "wrong"})
    assert response.status_code == 429


def test_registration_rate_limit_and_generic_duplicate_message(client):
    payload = {"username": "parent", "password": "AnotherParent123!", "full_name": "Другой родитель"}
    for _ in range(5):
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 409
        assert response.json()["detail"] == "Не удалось создать аккаунт с этими данными"
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 429


def test_specialist_role_is_rejected_by_shared_child_access_helper(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    try:
        ensure_child_access(child_id, {"id": 999, "role": "specialist"})
    except Exception as error:
        assert getattr(error, "status_code", None) == 403
    else:
        raise AssertionError("Specialist access must require an explicit assignment model")


def test_local_plan_uses_only_safe_library_and_specialist_role_is_removed(client, parent_headers, admin_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    plan = client.post(f"/api/ai/plan/{child_id}", headers=parent_headers, json={"target_minutes": 3})
    assert plan.status_code == 200
    assert plan.json()["estimated_minutes"] == 3
    assert len(plan.json()["exercises"]) == 2
    assert plan.json()["generated_by"] == "local_rules"
    assert plan.json()["needs_ai_consent"] is False
    assert all(item["module"] != "motor" for item in plan.json()["exercises"])

    for minutes, expected_count in ((5, 3), (10, 5)):
        longer_plan = client.post(f"/api/ai/plan/{child_id}", headers=parent_headers, json={"target_minutes": minutes})
        assert longer_plan.status_code == 200
        assert longer_plan.json()["estimated_minutes"] == minutes
        assert len(longer_plan.json()["exercises"]) == expected_count

    assert all(item["role"] != "specialist" for item in client.get("/api/admin/users", headers=admin_headers).json())
    paths = client.get("/openapi.json").json()["paths"]
    assert not any(path.startswith("/api/specialist") for path in paths)
    assert not any("specialist-assignments" in path for path in paths)


def test_parent_helper_uses_local_reviewed_rules(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    response = client.post(f"/api/ai/ask/{child_id}", headers=parent_headers, json={"question": "Как мягко начать занятие?"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["generated_by"] == "local_rules"
    assert payload["model"] is None
    assert len(payload["suggested_actions"]) <= 3
    assert "диагноз" in payload["disclaimer"].lower()


def test_parent_helper_routes_urgent_question_to_professional_help(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    response = client.post(
        f"/api/ai/ask/{child_id}", headers=parent_headers,
        json={"question": "Что делать, если ребёнку внезапно больно глотать?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["generated_by"] == "local_rules"
    assert payload["needs_professional_help"] is True
    assert "специалист" in payload["answer"].lower()


def test_local_plan_has_no_model_or_token_usage(client, parent_headers, admin_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    response = client.post(f"/api/ai/plan/{child_id}", headers=parent_headers, json={"target_minutes": 3})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["generated_by"] == "local_rules"
    assert payload["model"] is None
    assert len(payload["exercises"]) == 2
    assert len({item["id"] for item in payload["exercises"]}) == 2
    assert all(item["module"] != "motor" for item in payload["exercises"])
    usage = client.get("/api/admin/usage", headers=admin_headers).json()
    assert usage["input_tokens"] == 0
    assert usage["output_tokens"] == 0
    assert len(usage["daily"]) == 30
    assert usage["recent"] == []


def test_student_local_plan_does_not_create_external_usage(client, student_headers, admin_headers):
    child_id = client.get("/api/children", headers=student_headers).json()[0]["id"]
    response = client.post(f"/api/ai/plan/{child_id}", headers=student_headers, json={"target_minutes": 3})
    assert response.status_code == 200, response.text
    assert response.json()["generated_by"] == "local_rules"

    usage = client.get("/api/admin/usage?days=7&limit=100", headers=admin_headers).json()
    assert usage["requests"] == 0


def test_learning_session_pause_and_measurements(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    plan = client.get(f"/api/session-plan/{child_id}?minutes=5", headers=parent_headers).json()
    created = client.post("/api/learning-sessions", headers=parent_headers, json={
        "child_id": child_id, "exercise_ids": [item["id"] for item in plan["exercises"]], "target_minutes": 5,
    })
    assert created.status_code == 201
    session = created.json()
    repeated = client.post("/api/learning-sessions", headers=parent_headers, json={
        "child_id": child_id, "exercise_ids": [item["id"] for item in plan["exercises"]], "target_minutes": 5,
    })
    assert repeated.status_code == 201
    assert repeated.json()["id"] == session["id"]
    paused = client.patch(f"/api/learning-sessions/{session['id']}/pause", headers=parent_headers)
    assert paused.json()["status"] == "paused"
    active = client.get(f"/api/children/{child_id}/active-session", headers=parent_headers)
    assert active.status_code == 200
    assert active.json()["id"] == session["id"]
    resumed = client.patch(f"/api/learning-sessions/{session['id']}/pause", headers=parent_headers)
    assert resumed.json()["status"] == "in_progress"

    exercise = session["exercises"][0]
    saved = client.post("/api/sessions", headers=parent_headers, json={
        **PARENT_CHILD_ATTEMPT,
        "child_id": child_id, "exercise_id": exercise["id"], "module": exercise["module"],
        "score": 80, "duration_seconds": 22, "details": {}, "learning_session_id": session["id"],
        "sequence_index": 0, "independence": 75, "prompt_level": "minimal", "response_ms": 1800,
        "communication_initiatives": 2, "attempts_count": 5, "correct_answers": 4,
    })
    assert saved.status_code == 201
    for index, exercise in enumerate(session["exercises"][1:], start=1):
        response = client.post("/api/sessions", headers=parent_headers, json={
            **PARENT_CHILD_ATTEMPT,
            "child_id": child_id, "exercise_id": exercise["id"], "module": exercise["module"],
            "score": 80, "duration_seconds": 20, "details": {}, "learning_session_id": session["id"],
            "sequence_index": index, "independence": 75, "prompt_level": "minimal",
            "communication_initiatives": 1, "attempts_count": 5, "correct_answers": 4,
        })
        assert response.status_code == 201, response.text
    finished = client.get(f"/api/learning-sessions/{session['id']}", headers=parent_headers)
    assert finished.json()["status"] == "completed"
    homework = client.get(f"/api/homework/{child_id}", headers=parent_headers).json()
    assert not any(item["title"].startswith("Домашняя практика:") for item in homework)
    metrics = client.get(f"/api/progress/{child_id}", headers=parent_headers).json()["support_metrics"]
    assert metrics["average_independence"] == 75
    assert metrics["communication_initiatives"] >= 2


def test_old_session_resumes_pending_published_exercise_and_deduplicates_progress(client):
    registration = client.post("/api/auth/register", headers={"X-Soyle-Auth-Mode": "bearer"}, json={
        "username": "sessionrepair", "password": "SessionRepair123!", "full_name": "Проверка восстановления",
    })
    assert registration.status_code == 201, registration.text
    headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    child = client.post("/api/children", headers=headers, json={
        "name": "Тест занятия", "birth_date": "2020-05-04", "primary_module": "sensory", "avatar_color": "#82a78f",
    }).json()
    child_id = child["id"]
    consent = client.put(f"/api/children/{child_id}/consent", headers=headers, json={
        "privacy_accepted": True, "camera_processing": False, "ai_processing": False, "analytics_processing": False,
    })
    assert consent.status_code == 200, consent.text

    plan = client.get(f"/api/session-plan/{child_id}?minutes=5", headers=headers).json()["exercises"]
    assert len(plan) == 3
    created = client.post("/api/learning-sessions", headers=headers, json={
        "child_id": child_id, "exercise_ids": [exercise["id"] for exercise in plan], "target_minutes": 5,
    })
    assert created.status_code == 201, created.text
    session = created.json()
    first, pending, completed_later = session["exercises"]

    def save(exercise, status):
        sequence_index = next(
            (index for index, item in enumerate(session["exercises"]) if item["id"] == exercise["id"]),
            len(session["exercises"]),
        )
        payload = {
            **PARENT_CHILD_ATTEMPT,
            "child_id": child_id,
            "exercise_id": exercise["id"],
            "module": exercise["module"],
            "score": 0,
            "duration_seconds": 5,
            "details": {},
            "learning_session_id": session["id"],
            "sequence_index": sequence_index,
            "attempt_status": status,
        }
        response = client.post("/api/sessions", headers=headers, json=payload)
        assert response.status_code == 201, response.text

    save(first, "break")
    save(first, "participated")
    save(completed_later, "participated")

    try:
        with connect() as db:
            db.execute("UPDATE exercises SET is_active=0 WHERE id=?", (first["id"],))

        resumed = client.get(f"/api/children/{child_id}/active-session", headers=headers)
        assert resumed.status_code == 200, resumed.text
        payload = resumed.json()
        assert payload["status"] == "in_progress"
        assert payload["current_index"] == 1
        assert [exercise["id"] for exercise in payload["exercises"][:2]] == [completed_later["id"], pending["id"]]
        assert len(payload["exercises"]) == 3
        assert len(payload["results"]) == 3

        save(pending, "participated")
        save(payload["exercises"][2], "participated")
        finished = client.get(f"/api/learning-sessions/{session['id']}", headers=headers).json()
        assert finished["status"] == "completed"
        assert finished["current_index"] == 3
        assert len(finished["exercises"]) == 3
    finally:
        with connect() as db:
            db.execute("UPDATE exercises SET is_active=1 WHERE id=?", (first["id"],))


def test_local_helper_never_requires_external_ai_consent(client, admin_headers):
    registration = client.post("/api/auth/register", headers={"X-Soyle-Auth-Mode": "bearer"}, json={
        "username": "consentparent2", "password": "ConsentParent123!", "full_name": "Родитель AI-согласий",
    })
    parent = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    child = client.post("/api/children", headers=parent, json={
        "name": "Тест AI", "birth_date": "2020-05-04", "primary_module": "mixed", "avatar_color": "#82a78f",
    }).json()
    child_id = child["id"]
    initial = client.get(f"/api/children/{child_id}/consent", headers=parent).json()
    assert initial["ai_processing"] is False
    assert initial["ai_processing_at"] is None
    assert initial["version"] == "2026-10-local-face-1"

    local_answer = client.post(f"/api/ai/ask/{child_id}", headers=parent, json={"question": "Как начать занятие?"})
    assert local_answer.status_code == 200
    assert local_answer.json()["generated_by"] == "local_rules"
    local_plan = client.post(f"/api/ai/plan/{child_id}", headers=parent, json={"target_minutes": 3})
    assert local_plan.status_code == 200
    assert local_plan.json()["needs_ai_consent"] is False

    inconsistent = client.put(f"/api/children/{child_id}/consent", headers=parent, json={
        "privacy_accepted": False, "camera_processing": False, "ai_processing": True, "analytics_processing": False,
    })
    assert inconsistent.status_code == 422
    enabled = client.put(f"/api/children/{child_id}/consent", headers=parent, json={
        "privacy_accepted": True, "camera_processing": False, "ai_processing": True, "analytics_processing": False,
    })
    assert enabled.status_code == 200
    assert enabled.json()["ai_processing"] is True
    assert enabled.json()["ai_processing_at"]
    assert client.post(f"/api/ai/ask/{child_id}", headers=parent, json={"question": "Как начать занятие?"}).status_code == 200

    revoked = client.put(f"/api/children/{child_id}/consent", headers=parent, json={
        "privacy_accepted": True, "camera_processing": False, "ai_processing": False, "analytics_processing": False,
    })
    assert revoked.status_code == 200
    assert revoked.json()["ai_processing_at"] is None
    assert client.post(f"/api/ai/ask/{child_id}", headers=parent, json={"question": "Как начать занятие?"}).status_code == 200
    audits = client.get("/api/admin/audit", headers=admin_headers).json()
    assert any(item["action"] == "consent.update" and item["object_id"] == str(child_id) for item in audits)


def test_student_can_read_but_not_change_consent(client, parent_headers, student_headers):
    child_id = client.get("/api/children", headers=student_headers).json()[0]["id"]
    visible = client.get(f"/api/children/{child_id}/consent", headers=student_headers)
    assert visible.status_code == 200
    denied = client.put(f"/api/children/{child_id}/consent", headers=student_headers, json={
        "privacy_accepted": False,
        "camera_processing": False,
        "ai_processing": False,
        "analytics_processing": False,
    })
    assert denied.status_code == 403


def test_camera_consent_is_explicit_and_can_be_revoked(client):
    registration = client.post("/api/auth/register", headers={"X-Soyle-Auth-Mode": "bearer"}, json={
        "username": "cameraparent", "password": "CameraParent123!", "full_name": "Родитель камеры",
    })
    headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    child = client.post("/api/children", headers=headers, json={
        "name": "Тест камеры", "birth_date": "2020-05-04", "primary_module": "motor", "avatar_color": "#82a78f",
    }).json()
    child_id = child["id"]

    initial = client.get(f"/api/children/{child_id}/consent", headers=headers).json()
    assert initial["camera_processing"] is False
    assert initial["camera_processing_at"] is None

    enabled = client.put(f"/api/children/{child_id}/consent", headers=headers, json={
        "privacy_accepted": True, "camera_processing": True, "ai_processing": False, "analytics_processing": False,
    })
    assert enabled.status_code == 200
    assert enabled.json()["camera_processing"] is True
    assert enabled.json()["camera_processing_at"]

    with connect() as db:
        db.execute("UPDATE child_consents SET version='2026-10-mirror-only' WHERE child_id=?", (child_id,))
    stale = client.get(f"/api/children/{child_id}/consent", headers=headers).json()
    assert stale["privacy_accepted"] is True
    assert stale["camera_processing"] is False
    assert stale["camera_processing_at"] is None

    renewed = client.put(f"/api/children/{child_id}/consent", headers=headers, json={
        "privacy_accepted": True, "camera_processing": True, "ai_processing": False, "analytics_processing": False,
    })
    assert renewed.status_code == 200
    assert renewed.json()["version"] == "2026-10-local-face-1"
    assert renewed.json()["camera_processing"] is True

    revoked = client.put(f"/api/children/{child_id}/consent", headers=headers, json={
        "privacy_accepted": True, "camera_processing": False, "ai_processing": False, "analytics_processing": False,
    })
    assert revoked.status_code == 200
    assert revoked.json()["camera_processing"] is False
    assert revoked.json()["camera_processing_at"] is None


def test_game_results_are_server_calculated_and_non_scored_outcomes_are_separate(client):
    registration = client.post("/api/auth/register", headers={"X-Soyle-Auth-Mode": "bearer"}, json={
        "username": "metricsparent", "password": "MetricsParent123!", "full_name": "Родитель метрик",
    })
    assert registration.status_code == 201, registration.text
    headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    child = client.post("/api/children", headers=headers, json={
        "name": "Тест метрик", "birth_date": "2020-08-15", "primary_module": "sensory", "avatar_color": "#82a78f",
    }).json()
    consent = client.put(f"/api/children/{child['id']}/consent", headers=headers, json={
        "privacy_accepted": True,
        "camera_processing": True,
        "ai_processing": False,
        "analytics_processing": False,
    })
    assert consent.status_code == 200
    exercise = next(item for item in client.get("/api/exercises", headers=headers).json() if item["module"] == "sensory")

    saved_scores = []
    for correct in (0, 1, 4, 5):
        response = client.post("/api/sessions", headers=headers, json={
            **PARENT_CHILD_ATTEMPT,
            "child_id": child["id"], "exercise_id": exercise["id"], "module": "sensory",
            "score": 99, "duration_seconds": 12, "details": {"source": "test", "prompt_types": ["repeat_audio"] if correct == 4 else []},
            "attempts_count": 5, "correct_answers": correct, "prompts_used": 5 - correct,
            "attempt_status": "completed", "independence": correct * 20,
            "prompt_level": "independent" if correct == 5 else "minimal",
        })
        assert response.status_code == 201, response.text
        saved_scores.append(response.json()["score"])
        assert response.json()["measurement_version"] == 3
        if correct == 4:
            assert response.json()["details"]["prompt_types"] == ["repeat_audio"]
    assert saved_scores == [0, 20, 80, 100]

    technical = client.post("/api/sessions", headers=headers, json={
        **PARENT_CHILD_ATTEMPT,
        "child_id": child["id"], "exercise_id": exercise["id"], "module": "sensory",
        "score": 100, "duration_seconds": 4, "details": {"reason": "audio_unavailable"},
        "attempts_count": 5, "correct_answers": 0, "prompts_used": 0,
        "attempt_status": "technical_error",
    })
    assert technical.status_code == 201
    assert technical.json()["score"] == 0
    assert technical.json()["awarded_stars"] == 0

    for status in ("refused", "break"):
        response = client.post("/api/sessions", headers=headers, json={
            **PARENT_CHILD_ATTEMPT,
            "child_id": child["id"], "exercise_id": exercise["id"], "module": "sensory",
            "score": 100, "duration_seconds": 2, "details": {},
            "attempts_count": 0, "correct_answers": 0, "prompts_used": 0,
            "attempt_status": status,
        })
        assert response.status_code == 201
        assert response.json()["score"] == 0
        assert response.json()["awarded_stars"] == 0

    assert not [item for item in client.get("/api/exercises", headers=headers).json() if item["module"] == "motor"]
    with connect() as db:
        motor_exercise = dict(db.execute("SELECT * FROM exercises WHERE module='motor' ORDER BY id LIMIT 1").fetchone())
        motor_version = dict(db.execute("SELECT * FROM exercise_versions WHERE exercise_id=?", (motor_exercise["id"],)).fetchone())
    assert motor_exercise["is_active"] == 0
    assert motor_version["publication_status"] == "internal_review"
    rejected_motor = client.post("/api/sessions", headers=headers, json={
        **PARENT_CHILD_ATTEMPT,
        "child_id": child["id"], "exercise_id": motor_exercise["id"], "module": "motor",
        "score": 99, "duration_seconds": 8, "details": {"source": "manual"},
        "attempt_status": "participated", "independence": 100, "prompt_level": "independent",
    })
    assert rejected_motor.status_code == 422

    invalid = client.post("/api/sessions", headers=headers, json={
        "child_id": child["id"], "exercise_id": exercise["id"], "module": "sensory",
        "score": 100, "duration_seconds": 1, "details": {},
        "attempts_count": 5, "correct_answers": 6,
    })
    assert invalid.status_code == 422

    progress = client.get(f"/api/progress/{child['id']}", headers=headers)
    assert progress.status_code == 200
    metrics = progress.json()["support_metrics"]
    assert metrics["attempts_count"] == 25
    assert metrics["correct_answers"] == 10
    assert metrics["prompts_used"] == 10
    assert metrics["technical_errors"] == 1
    assert metrics["refusals"] == 1
    assert metrics["breaks"] == 1
    assert metrics["participations"] == 0
    assert metrics["game_result_average"] == 50

    dashboard = client.get(f"/api/dashboard/{child['id']}", headers=headers).json()
    assert dashboard["module_accuracy"]["sensory"] == 50
    assert dashboard["module_accuracy"]["motor"] is None
    assert dashboard["module_completed"]["motor"] == 0
    assert motor_exercise["id"] not in dashboard["completed_exercise_ids"]
    assert next(item for item in dashboard["recent"] if item["attempt_status"] == "break")["score"] == 0
    assert next(item for item in dashboard["recent"] if item["attempt_status"] == "technical_error")["score"] == 0
    assert dashboard["today_sessions"] == 5
    assert dashboard["week_sessions"] == 5
    assert len(dashboard["week_activity"]) == 7
    today_activity = next(item for item in dashboard["week_activity"] if item["today"])
    assert today_activity["active"] is True
    assert today_activity["sessions"] == 5
    assert sum(item["active"] for item in dashboard["week_activity"]) == 1
    assert dashboard["streak_days"] == 1

    assert dashboard["weakest_skill"] is None
    assert dashboard["recommended_exercise"] is None
    assert dashboard["progress_delta"] is None


def test_aac_grammar_uses_safe_language_specific_templates(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    cards = client.get(f"/api/aac/cards/{child_id}", headers=parent_headers).json()
    by_label = {item["label"]: item for item in cards}
    assert by_label["Хочу"]["speech"] == "хочу"
    assert by_label["Хочу"]["lemma"] == "хотеть"
    assert by_label["Хочу"]["grammatical_role"] == "action"
    assert by_label["Я"]["grammatical_role"] == "subject"
    assert by_label["Сок"]["grammatical_role"] == "object"

    composed = client.post("/api/aac/compose", headers=parent_headers, json={
        "child_id": child_id,
        "card_ids": [by_label["Я"]["id"], by_label["Хочу"]["id"], by_label["Сок"]["id"]],
        "language": "ru",
    })
    assert composed.status_code == 200
    assert composed.json()["valid"] is True
    assert composed.json()["phrase"] == "Я хочу сок"

    invalid = client.post("/api/aac/compose", headers=parent_headers, json={
        "child_id": child_id,
        "card_ids": [by_label["Я"]["id"], by_label["Сок"]["id"]],
        "language": "ru",
    })
    assert invalid.status_code == 200
    assert invalid.json()["valid"] is False
    assert invalid.json()["phrase"] == ""

    ready = client.post("/api/aac/compose", headers=parent_headers, json={
        "child_id": child_id, "card_ids": [by_label["Помоги"]["id"]], "language": "ru",
    }).json()
    assert ready["phrase"] == "Помоги мне"

    observation = client.post("/api/aac/compose", headers=parent_headers, json={
        "child_id": child_id,
        "card_ids": [by_label["Я"]["id"], by_label["Вижу"]["id"], by_label["Мама"]["id"]],
        "language": "ru",
    }).json()
    assert observation["valid"] is True
    assert observation["phrase"] == "Я вижу маму"

    seen_cat = client.post("/api/aac/compose", headers=parent_headers, json={
        "child_id": child_id,
        "card_ids": [by_label["Вижу"]["id"], by_label["Кот"]["id"]],
        "language": "ru",
    }).json()
    assert seen_cat["valid"] is True
    assert seen_cat["phrase"] == "Вижу кота"

    english = compose_aac_phrase([
        {"speech": "I", "language": "en", "grammatical_role": "subject"},
        {"speech": "want", "language": "en", "grammatical_role": "action"},
        {"speech": "juice", "language": "en", "grammatical_role": "object"},
    ], "en")
    assert english == {"valid": True, "phrase": "I want juice", "reason": "", "pattern": "subject+action+object"}

    kazakh = compose_aac_phrase([
        {"speech": "Мен", "language": "kk", "grammatical_role": "subject"},
        {"speech": "шырын", "language": "kk", "grammatical_role": "object"},
        {"speech": "қалаймын", "language": "kk", "grammatical_role": "action"},
    ], "kk")
    assert kazakh == {"valid": True, "phrase": "Мен шырын қалаймын", "reason": "", "pattern": "subject+object+action"}


def test_only_supported_aac_learning_scenarios_are_active(client, parent_headers):
    mixed = [item for item in client.get("/api/exercises?module=mixed", headers=parent_headers).json()]
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    cards = client.get(f"/api/aac/cards/{child_id}", headers=parent_headers).json()
    cards_by_label = {card["label"]: card for card in cards}
    assert {item["target"] for item in mixed} == {
        "request", "choice", "refusal", "feelings", "help",
        "answer", "observation", "past_event", "question", "routine",
    }
    assert len(mixed) == 10
    assert all(item["engine"]["content"]["steps"] for item in mixed)
    assert all(item["engine"]["content"]["action_label"] for item in mixed)
    assert all(item["engine"]["content"]["completion"]["accepted_labels"] for item in mixed)
    assert all(item["engine"]["content"]["accepted_sequences"] for item in mixed)
    for item in mixed:
        content = item["engine"]["content"]
        labels = content["labels"]
        sequences = content["accepted_sequences"]
        assert len(labels) == len(set(labels))
        assert len({tuple(sequence) for sequence in sequences}) == len(sequences)
        assert all(len(sequence) == len(set(sequence)) for sequence in sequences)
        assert all(set(sequence).issubset(labels) for sequence in sequences)
        composed_phrases = []
        for sequence in sequences:
            composed = compose_aac_phrase([cards_by_label[label] for label in sequence], "ru")
            assert composed["valid"] is True, (item["target"], sequence, composed["reason"])
            composed_phrases.append(composed["phrase"])
        assert len(composed_phrases) == len(set(composed_phrases))
    request = next(item for item in mixed if item["target"] == "request")["engine"]["content"]
    assert "Хочу" not in request["completion"]["accepted_labels"]
    assert set(request["completion"]["accepted_labels"]) == {"Сок", "Вода", "Мяч", "Книга"}
    observation = next(item for item in mixed if item["target"] == "observation")["engine"]["content"]
    assert ["Я", "Вижу", "Мама"] in observation["accepted_sequences"]
    assert "Играю" not in observation["labels"]
    past_event = next(item for item in mixed if item["target"] == "past_event")["engine"]["content"]
    assert set(past_event["labels"]) == {"Я", "Играл", "Гулял"}


def test_only_sensory_sets_with_eight_stimuli_are_active(client, parent_headers):
    sensory = client.get("/api/exercises?module=sensory", headers=parent_headers).json()
    assert {item["target"] for item in sensory} == {"animals", "food", "toys"}
    assert len(sensory) == 3
    public_assets = Path(__file__).resolve().parents[2] / "frontend" / "public"
    for exercise in sensory:
        references = [item["media_ref"] for item in exercise["engine"]["content"]["stimuli"]]
        assert len(references) == len(set(references)) == 8
        assert all(reference.startswith("/app-illustrations/exercise-stimulus-") for reference in references)
        assert all((public_assets / reference.lstrip("/")).is_file() for reference in references)
    animal_media = {
        item["label"]: item.get("media_ref")
        for item in next(exercise for exercise in sensory if exercise["target"] == "animals")["engine"]["content"]["stimuli"]
    }
    assert animal_media == {label: f"/app-illustrations/exercise-stimulus-{key}.webp" for label, key in {
        "Кот": "cat", "Кролик": "rabbit", "Рыба": "fish", "Птица": "bird",
        "Собака": "dog", "Черепаха": "turtle", "Улитка": "snail", "Жук": "bug",
    }.items()}
    with connect() as db:
        hidden = db.execute("SELECT target FROM exercises WHERE module='sensory' AND is_active=0").fetchall()
    assert {item["target"] for item in hidden} == {
        "body", "clothes", "household", "actions", "qualities",
        "location", "places", "opposites", "commands", "p1-word-runner-demo",
        "p1-simple-instructions-demo", "p15-nouns-toys", "p15-nouns-food",
        "p15-nouns-animals", "p15-nouns-clothing", "p15-nouns-home",
        "p15-nouns-body", "p15-actions-core", "p15-instructions-one-step",
    }


def test_published_exercises_are_versioned_and_motor_is_not_public(client, parent_headers):
    exercises = client.get("/api/exercises", headers=parent_headers).json()
    assert exercises
    assert all(item["module"] != "motor" for item in exercises)
    assert all(item["engine"]["publication_status"] == "published" for item in exercises)
    assert all(item["engine"]["review_status"] == "approved" for item in exercises)
    sensory = next(item for item in exercises if item["module"] == "sensory")
    assert sensory["engine"]["mechanic"] == "auditory_choice"
    assert len(sensory["engine"]["content"]["stimuli"]) == 8
    assert sensory["engine"]["completion_rule"]["success"] == "matching_stimulus_key"
    routine = next(item for item in exercises if item["target"] == "routine")
    assert routine["engine"]["version"] == 2
    assert routine["instruction"] == "Выбери одно знакомое действие дня и сообщи о нём"
    assert "последователь" not in routine["instruction"].lower()


def test_admin_constructor_creates_safe_draft_and_blocks_unreviewed_publish(client, admin_headers):
    payload = {
        "module": "sensory",
        "mechanic": "auditory_choice",
        "title": "Найди знакомый предмет",
        "objective": "Сопоставить услышанное слово с изображением",
        "instruction": "Послушай и выбери картинку",
        "difficulty": 1,
        "skill": "vocabulary",
        "language": "ru",
        "response_mode": "single_tap",
        "prompt_policy": {"steps": ["repeat_audio", "visual_hint", "reduced_choice"], "time_limit": None, "max_attempts": 3},
        "completion_rule": {"rounds": 5, "success": "matching_stimulus_key"},
        "content": {"stimuli": [
            {"key": "cup", "label": "Чашка", "speech": "Чашка", "visual_token": "cup"},
            {"key": "spoon", "label": "Ложка", "speech": "Ложка", "visual_token": "spoon"},
            {"key": "plate", "label": "Тарелка", "speech": "Тарелка", "visual_token": "plate"},
                {"key": "book", "label": "Книга", "speech": "Книга", "media_ref": "/aac-pictograms/book.png"},
            ], "difficulty_levels": [
                {"level": 1, "option_count": 2, "rounds": 4, "max_attempts": 3},
                {"level": 2, "option_count": 3, "rounds": 5, "max_attempts": 3},
                {"level": 3, "option_count": 4, "rounds": 5, "max_attempts": 3},
            ]},
        "method_card": {
            "target_skill": "Сопоставить услышанное слово с изображением",
            "skill_group": ["понимание предметов"],
            "intended_for": ["Дети, которым нужна практика понимания знакомых слов"],
            "diagnosis_boundary": "Группа описана через наблюдаемый навык, а не диагноз.",
            "prerequisites": ["Может рассмотреть два изображения"],
            "stimuli_and_responses": "Изображения предметов; ответ — одно нажатие.",
            "child_instruction": "Послушай и выбери картинку",
            "adult_guidance": ["Дать время на ответ"],
            "accepted_responses": ["Нажатие", "Отказ", "Перерыв"],
            "difficulty_levels": ["Два, три или четыре варианта"],
            "prompts": ["Повторить аудио", "Сократить выбор"],
            "ambiguities": ["Однозначность изображений требует ручной проверки"],
            "stop_conditions": ["Отказ", "Дискомфорт"],
            "result_registration": ["Разделять самостоятельный ответ и подсказку"],
            "real_life_transfer": ["Найти знакомый предмет дома"],
            "sources": [],
            "evidence_note": "Синтетический тестовый материал требует независимой методической проверки.",
            "methodology_review_status": "pending",
        },
    }
    created = client.post("/api/admin/exercise-drafts", headers=admin_headers, json=payload)
    assert created.status_code == 201, created.text
    preview = created.json()
    assert preview["valid"] is False
    assert preview["can_publish"] is False
    assert preview["blocker"] is None
    assert any("единый проверенный набор иллюстраций" in error for error in preview["errors"])
    version_id = preview["version"]["id"]
    exercise_id = preview["version"]["exercise_id"]
    assert client.post(f"/api/admin/exercise-drafts/{version_id}/publish", headers=admin_headers).status_code == 422
    assert exercise_id not in {item["id"] for item in client.get("/api/exercises", headers=admin_headers).json()}


def test_aac_stop_is_core_and_duplicate_custom_card_is_rejected(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    cards = client.get(f"/api/aac/cards/{child_id}", headers=parent_headers).json()
    stop = next(item for item in cards if item["label"] == "Стоп")
    assert stop["is_core"] == 1
    duplicate = client.post("/api/aac/cards", headers=parent_headers, json={
        "child_id": child_id,
        "label": "Стоп",
        "speech": "Стоп",
        "category": "help",
        "image": "/soyle-mark.svg",
    })
    assert duplicate.status_code == 409


def test_tts_rejects_unknown_language_before_audio_generation(client, parent_headers):
    for language in ("de", "en", "kk"):
        response = client.post("/api/tts", headers=parent_headers, json={
            "text": "test", "rate": 0.8, "language": language,
        })
        assert response.status_code == 422


def test_bundled_tts_serves_guided_aac_without_browser_voice(client, parent_headers):
    response = client.post("/api/tts", headers=parent_headers, json={
        "text": "Я вижу маму", "rate": 0.72, "language": "ru",
    })
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.headers["x-soyle-tts"] == "bundled"
    assert response.headers["cache-control"] == "no-store"
    assert response.content[:4] == b"RIFF"


def test_future_birth_date_is_rejected(client, parent_headers):
    response = client.post("/api/children", headers=parent_headers, json={
        "name": "Ребёнок из будущего",
        "birth_date": (date.today() + timedelta(days=1)).isoformat(),
        "primary_module": "mixed",
        "avatar_color": "#82a78f",
    })
    assert response.status_code == 422


def test_export_is_complete_and_delete_requires_password(client):
    registration = client.post("/api/auth/register", headers={"X-Soyle-Auth-Mode": "bearer"}, json={
        "username": "exportparent", "password": "ExportParent123!", "full_name": "Родитель выгрузки",
    })
    assert registration.status_code == 201, registration.text
    headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    created = client.post("/api/children", headers=headers, json={
        "name": "Тест выгрузки", "birth_date": "2020-04-03", "primary_module": "mixed", "avatar_color": "#82a78f",
    })
    assert created.status_code == 201, created.text
    child_id = created.json()["id"]
    consent = client.put(f"/api/children/{child_id}/consent", headers=headers, json={
        "privacy_accepted": True,
        "camera_processing": False,
        "ai_processing": False,
        "analytics_processing": True,
    })
    assert consent.status_code == 200

    exported = client.get(f"/api/children/{child_id}/export", headers=headers)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/json")
    assert f"soyle-child-{child_id}.json" in exported.headers["content-disposition"]
    data = exported.json()
    assert data["child"]["id"] == child_id
    assert data["consent"]["privacy_accepted"] == 1
    assert "password_hash" not in str(data)
    assert "pin_hash" not in str(data)
    assert {
        "settings", "sessions", "learning_sessions", "ai_usage", "assigned_exercises", "specialist_access",
        "specialist_recommendations", "goals", "homework", "aac_custom_cards", "aac_favorites",
        "aac_history", "notifications", "audit_events",
    }.issubset(data)

    denied = client.request("DELETE", f"/api/children/{child_id}", headers=headers, json={"password": "wrong-password"})
    assert denied.status_code == 403
    deleted = client.request("DELETE", f"/api/children/{child_id}", headers=headers, json={"password": "ExportParent123!"})
    assert deleted.status_code == 204
    assert child_id not in {item["id"] for item in client.get("/api/children", headers=headers).json()}

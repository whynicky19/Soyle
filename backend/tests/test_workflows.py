from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.aac_grammar import compose_aac_phrase
from app.database import connect
from app.main import app, auth_identifier


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


def test_login_rate_limit(client):
    for _ in range(5):
        response = client.post("/api/auth/login", json={"username": "rate-limited", "password": "wrong"})
        assert response.status_code == 401
    response = client.post("/api/auth/login", json={"username": "rate-limited", "password": "wrong"})
    assert response.status_code == 429


def test_ai_plan_uses_only_safe_library_and_specialist_role_is_removed(client, parent_headers, admin_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    plan = client.post(f"/api/ai/plan/{child_id}", headers=parent_headers, json={"target_minutes": 3})
    assert plan.status_code == 200
    assert plan.json()["estimated_minutes"] == 3
    assert len(plan.json()["exercises"]) == 2
    assert plan.json()["generated_by"] == "local_fallback"
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


def test_ai_parent_answer_has_safe_fallback(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    response = client.post(f"/api/ai/ask/{child_id}", headers=parent_headers, json={"question": "Как мягко начать занятие?"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["generated_by"] == "local_fallback"
    assert payload["provider_error"] == "not_configured"
    assert len(payload["suggested_actions"]) <= 3
    assert "диагноз" in payload["disclaimer"].lower()


def test_ai_parent_answer_explains_invalid_key(client, parent_headers, monkeypatch):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]

    class InvalidKeyError(Exception):
        status_code = 401
        body = {"error": {"code": "invalid_api_key"}}

    def reject_answer(_context):
        raise InvalidKeyError()

    monkeypatch.setattr("app.main.answer_parent", reject_answer)
    response = client.post(f"/api/ai/ask/{child_id}", headers=parent_headers, json={"question": "Как начать занятие?"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["generated_by"] == "local_fallback"
    assert payload["provider_error"] == "invalid_api_key"
    assert "API-ключ" in payload["provider_message"]


def test_ai_plan_validates_model_ids_and_records_tokens(client, parent_headers, admin_headers, monkeypatch):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]

    def fake_plan(context):
        assert len(context["allowed_exercises"]) <= 40
        allowed_ids = [item["id"] for item in context["allowed_exercises"]]
        return ({
            "title": "План от модели",
            "reason": "Короткое чередование заданий",
            "parent_tip": "Дайте время ответить",
            "exercise_ids": [999999, *allowed_ids[::-1]],
        }, {"input_tokens": 120, "output_tokens": 40})

    monkeypatch.setattr("app.main.generate_plan", fake_plan)
    response = client.post(f"/api/ai/plan/{child_id}", headers=parent_headers, json={"target_minutes": 3})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["generated_by"] == "openai"
    assert payload["model"] == "gpt-4o-mini"
    assert len(payload["exercises"]) == 2
    assert 999999 not in {item["id"] for item in payload["exercises"]}
    assert all(item["module"] != "motor" for item in payload["exercises"])
    usage = client.get("/api/admin/usage", headers=admin_headers).json()
    assert usage["input_tokens"] >= 120
    assert usage["output_tokens"] >= 40
    assert len(usage["daily"]) == 30
    event = next(item for item in usage["recent"] if item["feature"] == "home_practice_plan")
    assert event["actor_type"] == "user"
    assert event["actor_name"] == "Айгерим Садыкова"
    assert event["actor_username"] == "parent"
    assert event["actor_role"] == "parent"
    assert event["child_name"] == "Алихан"
    assert event["total_tokens"] == 160


def test_ai_usage_identifies_student_actor(client, student_headers, admin_headers, monkeypatch):
    child_id = client.get("/api/children", headers=student_headers).json()[0]["id"]

    def fake_plan(context):
        allowed_ids = [item["id"] for item in context["allowed_exercises"]]
        return ({
            "title": "Ученический план",
            "reason": "Короткая практика",
            "parent_tip": "Дайте время ответить",
            "exercise_ids": allowed_ids[:2],
        }, {"input_tokens": 30, "output_tokens": 10})

    monkeypatch.setattr("app.main.generate_plan", fake_plan)
    response = client.post(f"/api/ai/plan/{child_id}", headers=student_headers, json={"target_minutes": 3})
    assert response.status_code == 200, response.text
    assert response.json()["generated_by"] == "openai"

    usage = client.get("/api/admin/usage?days=7&limit=100", headers=admin_headers).json()
    event = next(item for item in usage["recent"] if item["actor_type"] == "student")
    assert event["actor_name"] == "Алихан"
    assert event["actor_username"] == "alikhan"
    assert event["actor_role"] == "student"
    assert event["child_name"] == "Алихан"
    assert event["total_tokens"] == 40


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
        "child_id": child_id, "exercise_id": exercise["id"], "module": exercise["module"],
        "score": 80, "duration_seconds": 22, "details": {}, "learning_session_id": session["id"],
        "sequence_index": 0, "independence": 75, "prompt_level": "minimal", "response_ms": 1800,
        "communication_initiatives": 2, "attempts_count": 5, "correct_answers": 4,
    })
    assert saved.status_code == 201
    for index, exercise in enumerate(session["exercises"][1:], start=1):
        response = client.post("/api/sessions", headers=parent_headers, json={
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


def test_ai_consent_is_opt_in_and_revocation_is_immediate(client, admin_headers):
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
    assert initial["version"] == "2026-10-ai-1"

    denied = client.post(f"/api/ai/ask/{child_id}", headers=parent, json={"question": "Как начать занятие?"})
    assert denied.status_code == 403
    local_plan = client.post(f"/api/ai/plan/{child_id}", headers=parent, json={"target_minutes": 3})
    assert local_plan.status_code == 200
    assert local_plan.json()["needs_ai_consent"] is True

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
    assert client.post(f"/api/ai/ask/{child_id}", headers=parent, json={"question": "Как начать занятие?"}).status_code == 403
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
        "camera_processing": False,
        "ai_processing": False,
        "analytics_processing": False,
    })
    assert consent.status_code == 200
    exercise = next(item for item in client.get("/api/exercises", headers=headers).json() if item["module"] == "sensory")

    saved_scores = []
    for correct in (0, 1, 4, 5):
        response = client.post("/api/sessions", headers=headers, json={
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
        motor_exercise = dict(db.execute("SELECT * FROM exercises WHERE module='motor' AND is_active=1 ORDER BY id LIMIT 1").fetchone())
    denied_motor = client.post("/api/sessions", headers=headers, json={
        "child_id": child["id"], "exercise_id": motor_exercise["id"], "module": "motor",
        "score": 99, "duration_seconds": 8,
        "details": {"source": "manual"},
        "attempt_status": "participated", "independence": 100, "prompt_level": "independent",
    })
    assert denied_motor.status_code == 403

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
    assert {item["target"] for item in mixed} == {
        "request", "choice", "refusal", "feelings", "help",
        "answer", "observation", "past_event", "question", "routine",
    }
    assert len(mixed) == 10


def test_only_sensory_sets_with_eight_stimuli_are_active(client, parent_headers):
    sensory = client.get("/api/exercises?module=sensory", headers=parent_headers).json()
    assert {item["target"] for item in sensory} == {"animals", "food", "toys"}
    assert len(sensory) == 3
    with connect() as db:
        hidden = db.execute("SELECT target FROM exercises WHERE module='sensory' AND is_active=0").fetchall()
    assert {item["target"] for item in hidden} == {
        "body", "clothes", "household", "actions", "qualities",
        "location", "places", "opposites", "commands",
    }


def test_tts_rejects_unknown_language_before_audio_generation(client, parent_headers):
    for language in ("de", "en", "kk"):
        response = client.post("/api/tts", headers=parent_headers, json={
            "text": "test", "rate": 0.8, "language": language,
        })
        assert response.status_code == 422


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

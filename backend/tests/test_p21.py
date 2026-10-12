from uuid import uuid4

from app.database import connect


def _new_child(client, headers, name="P21 Synthetic"):
    response = client.post(
        "/api/children",
        headers=headers,
        json={"name": name, "birth_date": "2021-05-10", "primary_module": "mixed", "avatar_color": "#587f69"},
    )
    assert response.status_code == 201, response.text
    child = response.json()
    consent = client.put(
        f"/api/children/{child['id']}/consent",
        headers=headers,
        json={"privacy_accepted": True, "camera_processing": False, "ai_processing": False, "analytics_processing": True},
    )
    assert consent.status_code == 200, consent.text
    return child


def _add_goal(client, headers, child_id, template_key="recognise-five-objects"):
    response = client.post(
        "/api/practice-goals",
        headers=headers,
        json={
            "child_id": child_id,
            "template_key": template_key,
            "baseline": "Выбирает знакомую картинку после показа взрослого",
            "help_level": "full",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_goal_catalog_parent_flow_history_and_version_conflict(client, parent_headers):
    child = _new_child(client, parent_headers)
    templates = client.get("/api/practice-goal-templates", headers=parent_headers)
    assert templates.status_code == 200
    assert len(templates.json()) == 6
    assert {item["skill_category"] for item in templates.json()} >= {
        "object_understanding", "action_understanding", "instruction_understanding", "aac_use", "self_advocacy",
    }
    assert all("diagnosis" not in item and "speech_age" not in item for item in templates.json())

    goal = _add_goal(client, parent_headers, child["id"])
    assert goal["source"] == "parent_home_practice"
    assert goal["version"] == 1

    observation = client.post(
        f"/api/practice-goals/{goal['id']}/observations",
        headers=parent_headers,
        json={
            "child_id": child["id"], "result_type": "with_help", "prompt_level": "full",
            "note": "Нашёл мяч после жеста",
        },
    )
    assert observation.status_code == 201, observation.text
    assert observation.json()["source"] == "parent_real_life_observation"
    assert observation.json()["goal_version"] == 1

    updated = client.patch(
        f"/api/practice-goals/{goal['id']}",
        headers=parent_headers,
        json={"child_id": child["id"], "expected_version": 1, "help_level": "minimal"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    conflict = client.patch(
        f"/api/practice-goals/{goal['id']}",
        headers=parent_headers,
        json={"child_id": child["id"], "expected_version": 1, "status": "paused"},
    )
    assert conflict.status_code == 409

    listed = client.get(f"/api/practice-goals/{child['id']}", headers=parent_headers).json()
    assert listed[0]["observations"][0]["result_type"] == "with_help"
    assert [item["goal_version"] for item in listed[0]["history"]][:2] == [2, 1]
    assert all(item["mechanic"] == "auditory_choice" for item in listed[0]["linked_exercises"])


def test_goal_endpoints_are_family_isolated(client, parent_headers):
    username = f"p21-{uuid4().hex[:10]}"
    registered = client.post(
        "/api/auth/register",
        headers={"X-Soyle-Auth-Mode": "bearer"},
        json={"username": username, "password": "Synthetic123!", "full_name": "Другой родитель"},
    )
    assert registered.status_code == 201, registered.text
    other_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    other_child = _new_child(client, other_headers, "Other Synthetic")

    assert client.get(f"/api/practice-goals/{other_child['id']}", headers=parent_headers).status_code == 403
    assert client.get(f"/api/adaptive-plans/{other_child['id']}/history", headers=parent_headers).status_code == 403
    forbidden = client.post(
        "/api/practice-goals",
        headers=parent_headers,
        json={"child_id": other_child["id"], "template_key": "use-no-stop", "baseline": "Сигнал пока не отмечен", "help_level": "independent"},
    )
    assert forbidden.status_code == 403


def test_planner_uses_only_related_published_non_motor_versions(client, parent_headers):
    child = _new_child(client, parent_headers)
    goal = _add_goal(client, parent_headers, child["id"])
    observed = client.post(
        f"/api/practice-goals/{goal['id']}/observations",
        headers=parent_headers,
        json={
            "child_id": child["id"], "result_type": "with_help",
            "prompt_level": "full", "note": "Синтетическое бытовое наблюдение",
        },
    )
    assert observed.status_code == 201, observed.text
    response = client.post(
        f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 10},
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    assert plan["rules_version"] == "p2.1-rules-1"
    assert plan["items"]
    assert {item["target"] for item in plan["items"]} <= {"animals", "food", "toys"}
    assert all(item["module"] != "motor" for item in plan["items"])
    assert all(item["goal_version"] == 1 for item in plan["items"])
    assert all(item["assignment_reason"]["messages"] for item in plan["items"])
    assert all(item["assignment_reason"]["evidence"]["parent_observations"]["count"] == 1 for item in plan["items"])
    assert all("бытовое наблюдение" in " ".join(item["assignment_reason"]["messages"]) for item in plan["items"])
    assert all(item["difficulty_params"]["instruction_step_count"] == 1 for item in plan["items"])
    with connect() as db:
        for item in plan["items"]:
            version = db.execute("SELECT * FROM exercise_versions WHERE id=?", (item["exercise_version_id"],)).fetchone()
            exercise = db.execute("SELECT module FROM exercises WHERE id=?", (item["exercise_id"],)).fetchone()
            assert version["review_status"] == "approved"
            assert version["publication_status"] == "published"
            assert exercise["module"] != "motor"
    started = client.post(
        "/api/learning-sessions", headers=parent_headers,
        json={
            "child_id": child["id"], "exercise_ids": [item["exercise_id"] for item in plan["items"]],
            "target_minutes": 10, "adaptive_plan_id": plan["id"],
        },
    )
    assert started.status_code == 201, started.text
    resumed = client.get(f"/api/children/{child['id']}/active-session", headers=parent_headers).json()
    assert len(resumed["exercises"]) == len(plan["items"])
    assert {item["target"] for item in resumed["exercises"]} <= {"animals", "food", "toys"}


def test_planner_is_honest_when_related_catalog_is_unapproved_or_avoided(client, parent_headers):
    action_child = _new_child(client, parent_headers)
    _add_goal(client, parent_headers, action_child["id"], "recognise-actions")
    action_plan = client.post(
        f"/api/adaptive-plans/{action_child['id']}", headers=parent_headers, json={"target_minutes": 3},
    ).json()
    assert action_plan["items"] == []
    assert "нет опубликованного" in action_plan["notices"][0]["message"]

    object_child = _new_child(client, parent_headers)
    goal = _add_goal(client, parent_headers, object_child["id"])
    linked = client.get(f"/api/practice-goals/{object_child['id']}", headers=parent_headers).json()[0]["linked_exercises"]
    saved = client.put(
        f"/api/practice-preferences/{object_child['id']}", headers=parent_headers,
        json={"preferred_exercise_ids": [], "avoided_exercise_ids": [item["id"] for item in linked], "note": "Пока не предлагать"},
    )
    assert saved.status_code == 200, saved.text
    avoided_plan = client.post(
        f"/api/adaptive-plans/{object_child['id']}", headers=parent_headers, json={"target_minutes": 5},
    ).json()
    assert avoided_plan["items"] == []
    assert avoided_plan["notices"][0]["goal_id"] == goal["id"]


def test_difficulty_never_increases_after_one_success_and_ignores_breaks(client, parent_headers):
    child = _new_child(client, parent_headers)
    _add_goal(client, parent_headers, child["id"])
    exercises = client.get("/api/exercises", headers=parent_headers).json()
    exercise = next(item for item in exercises if item["target"] == "animals")

    def save(status="completed"):
        body = {
            "child_id": child["id"], "exercise_id": exercise["id"], "module": "sensory",
            "score": 100, "duration_seconds": 20, "details": {"source": "p21-test"}, "attempt_status": status,
        }
        if status == "completed":
            body.update({"attempts_count": 4, "correct_answers": 4, "gameplay_choices": 4, "independent_completions": 1, "prompts_used": 0, "prompt_level": "independent"})
        response = client.post("/api/sessions", headers=parent_headers, json=body)
        assert response.status_code == 201, response.text

    save()
    save("break")
    save("refused")
    first_plan = client.post(f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 5}).json()
    first_item = next(item for item in first_plan["items"] if item["exercise_id"] == exercise["id"])
    assert first_item["difficulty_params"]["difficulty_level"] == 1
    assert first_item["assignment_reason"]["evidence"]["refusals"] == 1
    assert first_item["assignment_reason"]["evidence"]["breaks"] == 1

    save(); save()
    later_plan = client.post(f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 5}).json()
    later_item = next(item for item in later_plan["items"] if item["exercise_id"] == exercise["id"])
    assert later_item["difficulty_params"]["difficulty_level"] == 2
    assert later_item["assignment_reason"]["evidence"]["recorded_sessions"] == 3


def test_learning_session_preserves_plan_goal_and_difficulty_snapshot(client, parent_headers):
    child = _new_child(client, parent_headers)
    _add_goal(client, parent_headers, child["id"], "aac-ask-for-help")
    plan = client.post(f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 3}).json()
    assert plan["items"]
    started = client.post(
        "/api/learning-sessions", headers=parent_headers,
        json={
            "child_id": child["id"], "exercise_ids": [item["exercise_id"] for item in plan["items"]],
            "target_minutes": 3, "adaptive_plan_id": plan["id"],
        },
    )
    assert started.status_code == 201, started.text
    session = started.json()
    assert session["adaptive_plan_id"] == plan["id"]
    assert all(item["adaptive"]["goal_version"] == 1 for item in session["exercises"])
    assert all(item["adaptive"]["assignment_reason"]["codes"] for item in session["exercises"])

    item = session["exercises"][0]
    result = client.post(
        "/api/sessions", headers=parent_headers,
        json={
            "child_id": child["id"], "exercise_id": item["id"], "module": item["module"],
            "score": 0, "duration_seconds": 10, "details": {"source": "guided-aac"},
            "learning_session_id": session["id"], "sequence_index": 0, "attempt_status": "participated",
            "prompt_level": "minimal", "prompted_completions": 1,
        },
    )
    assert result.status_code == 201, result.text
    with connect() as db:
        saved = db.execute("SELECT adaptive_plan_item_id,exercise_version_id,prompt_level,attempt_status FROM sessions WHERE id=?", (result.json()["id"],)).fetchone()
        plan_item = db.execute("SELECT * FROM adaptive_practice_plan_items WHERE id=?", (saved["adaptive_plan_item_id"],)).fetchone()
        assert saved["exercise_version_id"] == plan_item["exercise_version_id"]
        assert saved["prompt_level"] == "minimal"
        assert saved["attempt_status"] == "participated"

from uuid import uuid4

from app.database import connect
from app.exercise_engine import published_exercise_rows


PARENT_CHILD_ATTEMPT = {
    "actor_role": "parent",
    "response_owner": "child",
    "support_context": "independent",
}


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
    assert len(templates.json()) == 11
    assert "recognise-familiar-examples" in {item["template_key"] for item in templates.json()}
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
    assert plan["rules_version"] == "p2.6-goal-progress-1"
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
            **PARENT_CHILD_ATTEMPT,
            "child_id": child["id"], "exercise_id": exercise["id"], "module": "sensory",
            "score": 100, "duration_seconds": 20, "details": {"source": "p21-test", "difficulty_level": 1, "option_count": 2}, "attempt_status": status,
        }
        if status == "completed":
            body.update({"attempts_count": 12, "correct_answers": 12, "gameplay_choices": 12, "independent_completions": 1, "prompts_used": 0, "prompt_level": "independent"})
        response = client.post("/api/sessions", headers=parent_headers, json=body)
        assert response.status_code == 201, response.text

    save()
    # Exclude unrelated choices so rotation does not hide the measured exercise
    # when the plan is shortened after a break.
    client.put(f"/api/practice-preferences/{child['id']}", headers=parent_headers, json={
        "preferred_exercise_ids": [], "avoided_exercise_ids": [item["id"] for item in exercises if item["target"] in {"food", "toys"}],
    }).raise_for_status()
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
    assert later_item["difficulty_params"]["difficulty_level"] == 1
    assert later_item["assignment_reason"]["evidence"]["recorded_sessions"] == 3


def test_recent_results_are_weighted_without_one_miss_erasing_stable_progress(client, parent_headers):
    child = _new_child(client, parent_headers)
    _add_goal(client, parent_headers, child["id"])
    exercise = next(
        item for item in client.get("/api/exercises", headers=parent_headers).json()
        if item["target"] == "animals"
    )

    def save(correct):
        response = client.post("/api/sessions", headers=parent_headers, json={
            **PARENT_CHILD_ATTEMPT,
            "child_id": child["id"], "exercise_id": exercise["id"], "module": "sensory",
            "score": correct * 25, "duration_seconds": 20, "details": {"source": "weighted-test", "difficulty_level": 1, "option_count": 2},
            "attempt_status": "completed", "attempts_count": 12, "correct_answers": correct * 3,
            "gameplay_choices": 12, "independent_completions": correct * 3,
            "prompted_completions": 0,
            "prompts_used": 0 if correct else 1,
            "prompt_level": "independent" if correct else "minimal",
        })
        assert response.status_code == 201, response.text

    for _ in range(7):
        save(4)
    save(0)
    plan = client.post(
        f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 5},
    ).json()
    measured = next(item for item in plan["items"] if item["exercise_id"] == exercise["id"])
    evidence = measured["assignment_reason"]["evidence"]
    assert evidence["recorded_sessions"] == 8
    assert evidence["weighted_accuracy"] > 0.8
    assert evidence["recency_weights"][0] > evidence["recency_weights"][-1]
    assert measured["difficulty_params"]["difficulty_level"] == 2
    assert all(item["difficulty_params"]["difficulty_level"] == 1 for item in plan["items"] if item["exercise_id"] != exercise["id"])


def test_planner_rotates_unused_exercises_before_repeating(client, parent_headers):
    child = _new_child(client, parent_headers)
    _add_goal(client, parent_headers, child["id"])

    first = client.post(
        f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 3},
    ).json()
    client.post("/api/learning-sessions", headers=parent_headers, json={"child_id": child["id"], "exercise_ids": [item["exercise_id"] for item in first["items"]], "target_minutes": 3, "adaptive_plan_id": first["id"]}).raise_for_status()
    second = client.post(
        f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 3},
    ).json()
    # Starting a plan does not mean every item has been shown or answered.
    assert [item["exercise_id"] for item in second["items"]] == [item["exercise_id"] for item in first["items"]]
    for item in first["items"]:
        saved = client.post("/api/sessions", headers=parent_headers, json={
            **PARENT_CHILD_ATTEMPT, "child_id": child["id"], "exercise_id": item["exercise_id"],
            "module": item["module"], "score": 0, "duration_seconds": 5, "attempt_status": "participated",
        })
        assert saved.status_code == 201, saved.text
    second = client.post(f"/api/adaptive-plans/{child['id']}", headers=parent_headers, json={"target_minutes": 3}).json()
    first_ids = [item["exercise_id"] for item in first["items"]]
    second_ids = [item["exercise_id"] for item in second["items"]]
    assert len(first_ids) == len(set(first_ids)) == 2
    assert len(second_ids) == len(set(second_ids)) == 2
    assert len(set(first_ids + second_ids)) == 3
    new_second = next(item for item in second["items"] if item["exercise_id"] not in first_ids)
    assert new_second["assignment_reason"]["evidence"]["assignment_count_before"] == 0
    assert "new_exercise" in new_second["assignment_reason"]["codes"]


def test_published_exercise_catalog_has_no_duplicate_tasks_or_round_items(client):
    with connect() as db:
        exercises = published_exercise_rows(db)
    assert len({item["id"] for item in exercises}) == len(exercises)
    assert len({(item["module"], item["target"]) for item in exercises}) == len(exercises)
    assert len({item["title"].strip().casefold() for item in exercises}) == len(exercises)
    for exercise in exercises:
        content = exercise["engine"]["content"]
        stimuli = content.get("stimuli") or []
        scenarios = content.get("scenarios") or []
        assert len({item["key"] for item in stimuli}) == len(stimuli), exercise["title"]
        assert len({item["label"].strip().casefold() for item in stimuli}) == len(stimuli), exercise["title"]
        assert len({item["key"] for item in scenarios}) == len(scenarios), exercise["title"]


def test_legacy_local_plan_also_rotates_completed_tasks(client, parent_headers):
    child = _new_child(client, parent_headers)
    _add_goal(client, parent_headers, child["id"])
    first = client.get(
        f"/api/session-plan/{child['id']}?minutes=3", headers=parent_headers,
    ).json()["exercises"]
    assert len(first) == 2
    for exercise in first:
        saved = client.post("/api/sessions", headers=parent_headers, json={
            **PARENT_CHILD_ATTEMPT,
            "child_id": child["id"], "exercise_id": exercise["id"], "module": exercise["module"],
            "score": 100, "duration_seconds": 10, "details": {"source": "rotation-test"},
            "attempt_status": "completed", "attempts_count": 1, "correct_answers": 1,
            "independent_completions": 1,
        })
        assert saved.status_code == 201, saved.text
    second = client.get(
        f"/api/session-plan/{child['id']}?minutes=3", headers=parent_headers,
    ).json()["exercises"]
    assert len({item["id"] for item in first + second}) == 3


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
            **PARENT_CHILD_ATTEMPT,
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

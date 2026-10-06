def test_auth_roles_and_child_access(client, parent_headers, admin_headers):
    assert client.get("/api/admin/stats", headers=parent_headers).status_code == 403
    assert client.get("/api/admin/stats", headers=admin_headers).status_code == 200

    registration = client.post("/api/auth/register", json={
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


def test_specialist_assignment_is_first_in_plan(client, parent_headers, specialist_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    exercises = client.get("/api/exercises", headers=specialist_headers).json()
    sensory = next(item for item in exercises if item["module"] == "sensory")
    assigned = client.post("/api/specialist/assigned-exercises", headers=specialist_headers, json={
        "child_id": child_id, "exercise_id": sensory["id"], "note": "Обязательное",
    })
    assert assigned.status_code == 201
    plan = client.get(f"/api/session-plan/{child_id}?minutes=3", headers=parent_headers)
    assert plan.status_code == 200
    assert plan.json()["estimated_minutes"] == 3
    assert len(plan.json()["exercises"]) == 5
    assert plan.json()["exercises"][0]["id"] == sensory["id"]


def test_goal_homework_and_progress_metrics(client, parent_headers, specialist_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    goal = client.post("/api/specialist/goals", headers=specialist_headers, json={
        "child_id": child_id,
        "title": "Самостоятельная просьба",
        "target_skill": "communication",
        "success_criterion": "Самостоятельно попросить желаемый предмет в 4 из 6 ситуаций",
        "difficulty": 1,
        "exercise_ids": [],
    })
    assert goal.status_code == 201
    assert client.get(f"/api/goals/{child_id}", headers=parent_headers).json()[0]["title"] == "Самостоятельная просьба"

    homework = client.post("/api/specialist/homework", headers=specialist_headers, json={
        "child_id": child_id, "goal_id": goal.json()["id"], "title": "Выбрать напиток",
        "instruction": "Предложите выбор из двух напитков и подождите ответ.",
    })
    assert homework.status_code == 201
    result = client.patch(f"/api/homework/{homework.json()['id']}/result", headers=parent_headers, json={
        "result": "independent", "parent_note": "Выбрал воду",
    })
    assert result.status_code == 200
    progress = client.get(f"/api/progress/{child_id}", headers=parent_headers)
    assert progress.status_code == 200
    assert progress.json()["support_metrics"]["homework_completed"] >= 1
    assert "самостоятельно" in progress.json()["support_metrics"]["plain_language"]


def test_learning_session_pause_and_measurements(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    plan = client.get(f"/api/session-plan/{child_id}?minutes=5", headers=parent_headers).json()
    created = client.post("/api/learning-sessions", headers=parent_headers, json={
        "child_id": child_id, "exercise_ids": [item["id"] for item in plan["exercises"]], "target_minutes": 5,
    })
    assert created.status_code == 201
    session = created.json()
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
        "communication_initiatives": 2,
    })
    assert saved.status_code == 201
    metrics = client.get(f"/api/progress/{child_id}", headers=parent_headers).json()["support_metrics"]
    assert metrics["average_independence"] == 75
    assert metrics["communication_initiatives"] >= 2

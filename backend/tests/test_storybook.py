import uuid

from app.database import connect


def book(client, parent_headers):
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    response = client.get(f"/api/storybooks/{child_id}/toy", headers=parent_headers)
    assert response.status_code == 200, response.text
    return child_id, response.json()


def send(client, headers, child_id, snapshot, action, **overrides):
    payload = {"version": snapshot["definition"]["version"], "expected_revision": snapshot["revision"], "scene_id": snapshot["definition"]["scenes"][snapshot["state"]["scene_index"]]["id"], "action": action, "event_id": str(uuid.uuid4()), **overrides}
    return client.post(f"/api/storybooks/{child_id}/toy/events", headers=headers, json=payload)


def test_storybook_draft_gate_version_and_full_non_scored_story(client, parent_headers, student_headers):
    child_id, snapshot = book(client, parent_headers)
    assert snapshot["preview"] and snapshot["definition"]["status"] == "DRAFT"
    assert len(snapshot["definition"]["scenes"]) == 6
    assert all(scene["status"] == "DRAFT" and scene["review_status"] == "pending" for scene in snapshot["definition"]["scenes"])
    assert client.get(f"/api/storybooks/{child_id}/toy", headers=student_headers).status_code == 403
    assert send(client, student_headers, child_id, snapshot, "choose_ball").status_code == 403
    assert send(client, parent_headers, child_id, snapshot, "choose_ball", version=999).status_code == 409
    snapshot = send(client, parent_headers, child_id, snapshot, "restart").json()
    for action in ["choose_train", "continue", "explore_ball", "find_teddy", "continue", "request_help", "continue"]:
        response = send(client, parent_headers, child_id, snapshot, action)
        assert response.status_code == 200, response.text
        snapshot = response.json()
    assert snapshot["state"]["scene_index"] == 3
    assert snapshot["state"]["chosen_toy"] == "train"
    assert snapshot["state"]["request"] == "request_help"
    assert send(client, parent_headers, child_id, snapshot, "give_misha").status_code == 422
    for action in ["take_teddy", "give_misha", "continue", "play_roll", "settle", "continue", "continue"]:
        response = send(client, parent_headers, child_id, snapshot, action)
        assert response.status_code == 200, response.text
        snapshot = response.json()
    assert snapshot["state"]["completed"]
    assert snapshot["state"]["play"] == "roll"
    persisted = client.get(f"/api/storybooks/{child_id}/toy", headers=parent_headers).json()
    assert persisted["state"] == snapshot["state"]
    with connect() as db:
        assert db.execute("SELECT COUNT(*) count FROM child_story_progress WHERE child_id=? AND story_key='toy'", (child_id,)).fetchone()["count"] == 0
    assert "score" not in snapshot["state"]


def test_storybook_assistance_break_skip_conflicts_and_idempotency(client, parent_headers):
    child_id, snapshot = book(client, parent_headers)
    snapshot = send(client, parent_headers, child_id, snapshot, "restart").json()
    assert send(client, parent_headers, child_id, snapshot, "continue").status_code == 422
    event_id = str(uuid.uuid4())
    changed = send(client, parent_headers, child_id, snapshot, "hint", event_id=event_id)
    assert changed.status_code == 200
    repeated = send(client, parent_headers, child_id, snapshot, "hint", event_id=event_id)
    assert repeated.json() == changed.json()
    assert send(client, parent_headers, child_id, snapshot, "choose_ball").status_code == 409
    snapshot = changed.json()
    snapshot = send(client, parent_headers, child_id, snapshot, "pause").json()
    assert snapshot["state"]["paused"]
    assert send(client, parent_headers, child_id, snapshot, "choose_ball").status_code == 422
    for action in ["resume", "assist", "continue", "skip", "continue"]:
        response = send(client, parent_headers, child_id, snapshot, action)
        assert response.status_code == 200, response.text
        snapshot = response.json()
    assert snapshot["state"]["assisted_scenes"] == ["hello"]
    assert snapshot["state"]["skipped_scenes"] == ["find"]
    assert snapshot["state"]["hinted_scenes"] == ["hello"]
    assert snapshot["state"]["scene_index"] == 2


def test_storybook_preview_is_family_isolated(client, parent_headers):
    child_id, snapshot = book(client, parent_headers)
    registered = client.post("/api/auth/register", headers={"X-Soyle-Auth-Mode": "bearer"}, json={"username": "story_other_parent", "email": "story-other@example.test", "password": "OtherParent123!", "full_name": "Другой родитель"})
    assert registered.status_code in {200, 201}, registered.text
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    assert client.get(f"/api/storybooks/{child_id}/toy", headers=headers).status_code == 403
    assert send(client, headers, child_id, snapshot, "restart").status_code == 403

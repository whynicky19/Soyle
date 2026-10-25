from itertools import product
from uuid import uuid4

import pytest

from app.database import connect
from app.interactive_storybook import initial_state, transition
from app.picnic_content import PICNIC


def step(state, action):
    return transition(state, action, str(uuid4()), PICNIC)


@pytest.mark.parametrize("toy,message,fruit", list(product(("ball", "book"), ("help", "point"), ("apple", "banana"))))
def test_all_picnic_branches_keep_choices_pause_and_finish(toy, message, fruit):
    state = initial_state()
    for scene in PICNIC["scenes"]:
        assert scene["id"] == PICNIC["scenes"][state["scene_index"]]["id"]
        paused = step(state, "refuse")
        assert paused["paused"]
        with pytest.raises(ValueError):
            step(paused, "continue")
        state = step(paused, "resume")
        if scene["id"] == "02": state = step(state, toy)
        elif scene["id"] == "04": state = step(state, message)
        elif scene["id"] == "08": state = step(state, fruit)
        elif scene["kind"] == "instruction":
            with pytest.raises(ValueError): step(state, "bag")
            state = step(state, "cup")
            state = step(state, "bag")
        state = step(state, "continue")
    assert state["completed"] and state["scene_index"] == 11
    assert state["choices"] == {"02": toy, "04": message, "08": fruit}
    assert len(state["viewed_scenes"]) == 12
    assert len(state["task_actions"]) == 4
    assert [scene["language_steps"] for scene in PICNIC["scenes"] if scene["kind"] == "instruction"] == [1, 2]
    assert "score" not in state and "accuracy" not in state


def test_back_restores_the_page_without_erasing_or_changing_a_choice():
    state = step(step(step(initial_state(), "continue"), "book"), "continue")
    state = step(state, "back")
    assert state["scene_index"] == 1 and state["ready"] and state["selected"] == "book"
    state = step(state, "ball")
    assert state["choices"]["02"] == "book"
    state = step(state, "continue")
    state = step(state, "hint")
    state = step(state, "cup")
    state = step(state, "bag")
    assert all(action["assisted"] for action in state["task_actions"])


def test_adult_assistance_does_not_invent_the_childs_preference():
    state = step(initial_state(), "continue")
    state = step(state, "assist")
    assert not state["ready"] and "02" not in state["choices"]
    state = step(state, "book")
    assert state["ready"] and state["choices"]["02"] == "book"


def test_picnic_draft_preview_is_versioned_idempotent_and_separate_from_children(client, parent_headers, student_headers, monkeypatch):
    child = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    url = f"/api/interactive-storybooks/{child}/picnic"
    monkeypatch.setitem(PICNIC, "status", "DRAFT")
    monkeypatch.setitem(PICNIC, "review_status", "pending")
    monkeypatch.setitem(PICNIC, "approval", {})
    assert client.get(url, headers=student_headers).status_code == 403
    # A publication status alone cannot replace administrator approval.
    monkeypatch.setitem(PICNIC, "status", "PUBLISHED")
    monkeypatch.setitem(PICNIC, "review_status", "approved")
    assert client.get(url, headers=student_headers).status_code == 403
    with connect() as db:
        before_child = [dict(row) for row in db.execute("SELECT * FROM storybook_progress WHERE child_id=? AND story_key='picnic' AND actor_key='child'", (child,)).fetchall()]
    first = client.get(url, headers=parent_headers)
    assert first.status_code == 200 and first.headers["cache-control"] == "private, no-store"
    snapshot = first.json()
    payload = {"version": 1, "expected_revision": snapshot["revision"], "scene_id": snapshot["definition"]["scenes"][snapshot["state"]["scene_index"]]["id"], "event_id": str(uuid4()), "action": "continue"}
    saved = client.post(url + "/events", headers=parent_headers, json=payload)
    assert saved.status_code == 200
    assert client.post(url + "/events", headers=parent_headers, json=payload).json() == saved.json()
    assert client.get(url, headers=parent_headers).json() == saved.json()
    assert client.post(url + "/events", headers=parent_headers, json={**payload, "version": 2, "event_id": str(uuid4())}).status_code == 409
    assert client.post(url + "/events", headers=parent_headers, json={**payload, "event_id": str(uuid4())}).status_code == 409
    with connect() as db:
        assert [dict(row) for row in db.execute("SELECT * FROM storybook_progress WHERE child_id=? AND story_key='picnic' AND actor_key='child'", (child,)).fetchall()] == before_child


def test_child_catalogue_requires_admin_approval_and_uses_the_same_player_api(client, parent_headers, student_headers, monkeypatch):
    child = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    url = f"/api/interactive-storybooks/{child}/picnic"
    monkeypatch.setitem(PICNIC, "status", "PUBLISHED")
    monkeypatch.setitem(PICNIC, "review_status", "approved")
    approvals = {stage: "pending" for stage in PICNIC["approval"]}
    monkeypatch.setitem(PICNIC, "approval", approvals)
    # Publishing is one administrator decision; pending content stays hidden.
    for stage in approvals:
        assert not any(story["key"] == "picnic" for story in client.get(f"/api/stories/{child}", headers=student_headers).json())
        assert client.get(url, headers=student_headers).status_code == 403
        approvals[stage] = "approved"
    catalogue = client.get(f"/api/stories/{child}", headers=student_headers).json()
    assert next(story for story in catalogue if story["key"] == "picnic")["engine"] == "interactive_book"
    snapshot = client.get(url, headers=student_headers).json()
    assert not snapshot["preview"]
    assert len(snapshot["definition"]["scenes"]) == 12
    saved = client.post(url + "/events", headers=student_headers, json={"version": 1, "expected_revision": snapshot["revision"], "scene_id": "01", "event_id": str(uuid4()), "action": "continue"})
    assert saved.status_code == 200
    assert saved.json()["state"]["scene_index"] == 1

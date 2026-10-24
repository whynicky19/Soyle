"""Regression checks for review gates, selection and recorded evidence."""
import json
import os
import subprocess
import sys
from uuid import uuid4

from app import exercise_engine
from app.adaptive_planner import DEFAULT_THRESHOLDS, _difficulty
from app.database import connect


def child_with_goal(client, headers):
    child = client.post("/api/children", headers=headers, json={
        "name": "Synthetic audit", "birth_date": "2021-05-10",
    }).json()
    child_id = child["id"]
    client.put(f"/api/children/{child_id}/consent", headers=headers, json={
        "privacy_accepted": True,
    }).raise_for_status()
    client.post("/api/practice-goals", headers=headers, json={
        "child_id": child_id, "template_key": "recognise-five-objects",
        "baseline": "Synthetic baseline", "help_level": "full",
    }).raise_for_status()
    return child_id


def attempt(child_id):
    return {"child_id": child_id, "exercise_id": 7, "module": "sensory",
            "score": 100, "duration_seconds": 10, "attempts_count": 12,
            "correct_answers": 12, "independent_completions": 12,
            "actor_role": "parent", "response_owner": "child",
            "support_context": "independent", "event_id": str(uuid4()),
            "details": {"difficulty_level": 1, "option_count": 2}}


def test_production_cannot_enable_unreviewed_demo_content():
    env = {**os.environ, "SOYLE_ENV": "production", "SOYLE_ALLOW_UNREVIEWED_DEMO_CONTENT": "true"}
    result = subprocess.run([sys.executable, "-c",
        "from app.exercise_engine import ALLOW_UNREVIEWED_DEMO_CONTENT; print(ALLOW_UNREVIEWED_DEMO_CONTENT)"],
        env=env, text=True, capture_output=True, check=True)
    assert result.stdout.strip() == "False"


def test_strict_review_gate_rejects_each_missing_approval(client, monkeypatch):
    monkeypatch.setattr(exercise_engine, "ALLOW_UNREVIEWED_DEMO_CONTENT", False)
    with connect() as db:
        version = dict(db.execute("SELECT * FROM exercise_versions WHERE exercise_id=7 AND publication_status='published'").fetchone())
        fields = {"technical_status": "passed", "methodology_status": "approved",
                  "accessibility_status": "approved", "release_status": "approved"}
        try:
            assert exercise_engine.published_exercise(db, 7) is None
            for field, value in fields.items():
                db.execute(f"UPDATE exercise_versions SET {field}=? WHERE id=?", (value, version["id"]))
            assert exercise_engine.published_exercise(db, 7)["engine"]["review_gate"]["approved"]
            for field, value in fields.items():
                db.execute(f"UPDATE exercise_versions SET {field}='pending' WHERE id=?", (version["id"],))
                assert exercise_engine.published_exercise(db, 7) is None
                db.execute(f"UPDATE exercise_versions SET {field}=? WHERE id=?", (value, version["id"]))
        finally:
            for field in fields:
                db.execute(f"UPDATE exercise_versions SET {field}=? WHERE id=?", (version[field], version["id"]))


def test_published_version_uses_its_stored_payload(client, monkeypatch):
    with connect() as db:
        row = db.execute("SELECT content_json FROM exercise_versions WHERE exercise_id=7 AND publication_status='published'").fetchone()
        stored = json.loads(row["content_json"])
        monkeypatch.setitem(exercise_engine.SENSORY_CONTENT, "animals", [{"key": "unreviewed-replacement"}])
        assert exercise_engine.published_exercise(db, 7)["engine"]["content"] == stored


def test_exclusions_apply_to_all_selection_and_save_paths(client, parent_headers):
    child_id = child_with_goal(client, parent_headers)
    all_ids = [item["id"] for item in client.get("/api/exercises", headers=parent_headers).json()]
    plan = client.post(f"/api/adaptive-plans/{child_id}", headers=parent_headers, json={"target_minutes": 5}).json()
    client.post("/api/learning-sessions", headers=parent_headers, json={
        "child_id": child_id, "exercise_ids": [item["exercise_id"] for item in plan["items"]],
        "adaptive_plan_id": plan["id"], "target_minutes": 5,
    }).raise_for_status()
    client.put(f"/api/practice-preferences/{child_id}", headers=parent_headers, json={
        "preferred_exercise_ids": [], "avoided_exercise_ids": all_ids, "note": "Synthetic exclusion",
    }).raise_for_status()
    assert client.get(f"/api/exercises?child_id={child_id}", headers=parent_headers).json() == []
    assert client.get(f"/api/dashboard/{child_id}", headers=parent_headers).json()["recommended_exercises"] == []
    assert client.get(f"/api/session-plan/{child_id}", headers=parent_headers).json()["exercises"] == []
    assert client.post(f"/api/adaptive-plans/{child_id}", headers=parent_headers, json={"target_minutes": 5}).json()["items"] == []
    assert client.post("/api/sessions", headers=parent_headers, json=attempt(child_id)).status_code == 409
    active = client.get(f"/api/children/{child_id}/active-session", headers=parent_headers).json()
    assert active is None or active["exercises"] == []
    assert client.post("/api/learning-sessions", headers=parent_headers, json={
        "child_id": child_id, "exercise_ids": [7], "target_minutes": 3,
    }).status_code == 422


def test_plan_preview_does_not_create_history_and_requires_a_goal(client, parent_headers):
    child_id = child_with_goal(client, parent_headers)
    before = client.get(f"/api/adaptive-plans/{child_id}/history", headers=parent_headers).json()
    preview = client.get(f"/api/session-plan/{child_id}", headers=parent_headers).json()
    assert preview["exercises"]
    suggested = client.get(f"/api/dashboard/{child_id}", headers=parent_headers).json()["recommended_exercises"]
    assert [item["id"] for item in suggested] == [item["id"] for item in preview["exercises"]]
    assert client.get(f"/api/adaptive-plans/{child_id}/history", headers=parent_headers).json() == before
    goal = client.get(f"/api/practice-goals/{child_id}", headers=parent_headers).json()[0]
    client.patch(f"/api/practice-goals/{goal['id']}", headers=parent_headers, json={
        "child_id": child_id, "expected_version": goal["version"], "status": "paused",
    }).raise_for_status()
    assert client.get(f"/api/session-plan/{child_id}", headers=parent_headers).json()["exercises"] == []


def test_retry_records_one_attempt_and_does_not_award_twice(client, parent_headers):
    child_id = child_with_goal(client, parent_headers)
    payload = attempt(child_id)
    first = client.post("/api/sessions", headers=parent_headers, json=payload)
    retry = client.post("/api/sessions", headers=parent_headers, json=payload)
    assert first.status_code == retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"]
    assert first.json()["awarded_stars"] > 0
    assert retry.json()["awarded_stars"] == 0
    with connect() as db:
        assert db.execute("SELECT COUNT(*) n FROM sessions WHERE child_id=?", (child_id,)).fetchone()["n"] == 1
    payload["duration_seconds"] += 1
    assert client.post("/api/sessions", headers=parent_headers, json=payload).status_code == 409


def test_refusal_preserves_difficulty_and_legacy_choice_plan_matches_runner():
    evidence = {"recorded_sessions": 6, "weighted_accuracy": 1,
                "weighted_independence_rate": 1, "independent_completions": 24,
                "refusals": 1, "breaks": 0}
    observation = {"latest_result": None, "refusals": 0, "breaks": 0}
    exercise = {"engine": {"mechanic": "auditory_choice", "content": {}}}
    params, _ = _difficulty(exercise, evidence, observation, "full", DEFAULT_THRESHOLDS)
    assert params["difficulty_level"] == 2
    assert params["option_count"] == 3
    assert params["round_count"] == 12
    assert "prompt_mode" not in params


def test_unreviewed_basic_stories_are_not_public(client, parent_headers, monkeypatch):
    monkeypatch.setattr(exercise_engine, "ALLOW_UNREVIEWED_DEMO_CONTENT", False)
    child_id = client.get("/api/children", headers=parent_headers).json()[0]["id"]
    assert client.get(f"/api/stories/{child_id}", headers=parent_headers).json() == []


def test_prompted_answers_do_not_raise_first_response_accuracy(client, parent_headers):
    child_id = child_with_goal(client, parent_headers)
    for _ in range(6):
        payload = {**attempt(child_id), "independent_completions": 0,
                   "prompted_completions": 12, "prompts_used": 12,
                   "support_context": "caregiver_supported", "prompt_level": "minimal"}
        client.post("/api/sessions", headers=parent_headers, json=payload).raise_for_status()
    plan = client.post(f"/api/adaptive-plans/{child_id}", headers=parent_headers, json={"target_minutes": 5}).json()
    for item in plan["items"]:
        assert item["difficulty_params"]["difficulty_level"] == 1
        assert item["assignment_reason"]["evidence"]["weighted_independent_accuracy"] == (0 if item["exercise_id"] == 7 else None)
        assert item["assignment_reason"]["evidence"]["weighted_accuracy"] == (1 if item["exercise_id"] == 7 else None)


def test_full_export_keeps_plans_and_observations_beyond_ui_limit(client, parent_headers):
    child_id = child_with_goal(client, parent_headers)
    goal = client.get(f"/api/practice-goals/{child_id}", headers=parent_headers).json()[0]
    for _ in range(22):
        client.post(f"/api/adaptive-plans/{child_id}", headers=parent_headers, json={"target_minutes": 3}).raise_for_status()
        client.post(f"/api/practice-goals/{goal['id']}/observations", headers=parent_headers, json={
            "child_id": child_id, "result_type": "independent", "prompt_level": "independent", "note": "Synthetic",
        }).raise_for_status()
    assert len(client.get(f"/api/adaptive-plans/{child_id}/history", headers=parent_headers).json()) == 20
    data = client.get(f"/api/children/{child_id}/export", headers=parent_headers).json()
    assert len(data["adaptive_practice_plans"]) == 22
    assert len(data["practice_goals"][0]["observations"]) == 22


def test_plan_cannot_start_after_its_goal_was_paused(client, parent_headers):
    child_id = child_with_goal(client, parent_headers)
    plan = client.post(f"/api/adaptive-plans/{child_id}", headers=parent_headers, json={"target_minutes": 3}).json()
    goal = client.get(f"/api/practice-goals/{child_id}", headers=parent_headers).json()[0]
    client.patch(f"/api/practice-goals/{goal['id']}", headers=parent_headers, json={
        "child_id": child_id, "expected_version": goal["version"], "status": "paused",
    }).raise_for_status()
    response = client.post("/api/learning-sessions", headers=parent_headers, json={
        "child_id": child_id, "exercise_ids": [item["exercise_id"] for item in plan["items"]],
        "adaptive_plan_id": plan["id"], "target_minutes": 3,
    })
    assert response.status_code == 409

"""Behavioural regressions for session lifecycle and comparable planning evidence."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.database import connect


def setup_child(client, headers):
    child = client.post('/api/children', headers=headers, json={'name': 'Synthetic P1', 'birth_date': '2021-01-01'}).json()
    cid = child['id']
    client.put(f'/api/children/{cid}/consent', headers=headers, json={'privacy_accepted': True}).raise_for_status()
    client.post('/api/practice-goals', headers=headers, json={
        'child_id': cid, 'template_key': 'recognise-five-objects', 'baseline': 'Synthetic baseline', 'help_level': 'independent',
    }).raise_for_status()
    exercises = client.get(f'/api/exercises?child_id={cid}', headers=headers).json()
    animal = next(item for item in exercises if item['target'] == 'animals')
    food = next(item for item in exercises if item['target'] == 'food')
    return cid, animal, food


def attempt(cid, exercise, **overrides):
    return {
        'child_id': cid, 'exercise_id': exercise['id'], 'module': exercise['module'],
        'actor_role': 'parent', 'response_owner': 'child', 'support_context': 'independent',
        'score': 100, 'duration_seconds': 10, 'attempt_status': 'completed',
        'attempts_count': 12, 'correct_answers': 12, 'independent_completions': 12,
        'details': {'difficulty_level': 1, 'option_count': 2}, 'event_id': str(uuid4()), **overrides,
    }


def start(client, headers, cid, exercises):
    response = client.post('/api/learning-sessions', headers=headers, json={
        'child_id': cid, 'exercise_ids': [item['id'] for item in exercises], 'target_minutes': 5,
    })
    assert response.status_code == 201, response.text
    return response.json()


def plan(client, headers, cid):
    response = client.post(f'/api/adaptive-plans/{cid}', headers=headers, json={'target_minutes': 5})
    assert response.status_code == 201, response.text
    return {item['exercise_id']: item for item in response.json()['items']}


def test_pause_is_idempotent_and_completed_session_stays_completed(client, parent_headers):
    cid, animal, _ = setup_child(client, parent_headers)
    session = start(client, parent_headers, cid, [animal])
    path = f"/api/learning-sessions/{session['id']}/pause"
    for _ in range(2):
        assert client.patch(path, headers=parent_headers).json()['status'] == 'paused'
    blocked = client.post('/api/sessions', headers=parent_headers, json=attempt(cid, animal, learning_session_id=session['id']))
    assert blocked.status_code == 409
    for _ in range(2):
        assert client.patch(path, headers=parent_headers, json={'paused': False}).json()['status'] == 'in_progress'
    body = attempt(cid, animal, learning_session_id=session['id'])
    saved = client.post('/api/sessions', headers=parent_headers, json=body)
    assert saved.status_code == 201, saved.text
    assert client.patch(path, headers=parent_headers).status_code == 409
    assert client.patch(path, headers=parent_headers, json={'paused': False}).status_code == 409
    assert client.get(f"/api/learning-sessions/{session['id']}", headers=parent_headers).json()['status'] == 'completed'
    replay = client.post('/api/sessions', headers=parent_headers, json=body)
    assert replay.status_code == 201 and replay.json()['awarded_stars'] == 0
    duplicate = client.post('/api/sessions', headers=parent_headers, json={**body, 'event_id': str(uuid4())})
    assert duplicate.status_code == 409


def test_refusal_pauses_on_server_and_requires_explicit_resume(client, parent_headers):
    cid, animal, food = setup_child(client, parent_headers)
    session = start(client, parent_headers, cid, [animal, food])
    body = attempt(cid, animal, learning_session_id=session['id'], attempt_status='refused', attempts_count=0, correct_answers=0, independent_completions=0)
    client.post('/api/sessions', headers=parent_headers, json=body).raise_for_status()
    current = client.get(f"/api/learning-sessions/{session['id']}", headers=parent_headers).json()
    assert current['status'] == 'paused' and current['current_index'] == 1
    next_body = attempt(cid, food, learning_session_id=session['id'])
    assert client.post('/api/sessions', headers=parent_headers, json=next_body).status_code == 409
    client.patch(f"/api/learning-sessions/{session['id']}/pause", headers=parent_headers, json={'paused': False}).raise_for_status()
    assert client.post('/api/sessions', headers=parent_headers, json=next_body).status_code == 201


def test_restore_does_not_fill_old_plan_with_unrequested_exercises(client, parent_headers):
    cid, animal, _ = setup_child(client, parent_headers)
    session = start(client, parent_headers, cid, [animal])
    for _ in range(2):
        current = client.get(f'/api/children/{cid}/active-session', headers=parent_headers).json()
        assert current['exercise_ids'] == [animal['id']]
        assert [item['id'] for item in current['exercises']] == [animal['id']]
    with connect() as db:
        assert db.execute('SELECT exercise_ids FROM learning_sessions WHERE id=?', (session['id'],)).fetchone()['exercise_ids'] == f"[{animal['id']}]"


def test_concurrent_start_and_final_result_do_not_duplicate_sessions_or_rewards(client, parent_headers):
    cid, animal, food = setup_child(client, parent_headers)
    with ThreadPoolExecutor(max_workers=2) as pool:
        created = list(pool.map(lambda _: start(client, parent_headers, cid, [animal, food]), range(2)))
    assert created[0]['id'] == created[1]['id']
    sid = created[0]['id']
    bodies = [attempt(cid, animal, learning_session_id=sid) for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        saved = list(pool.map(lambda body: client.post('/api/sessions', headers=parent_headers, json=body), bodies))
    assert sorted(response.status_code for response in saved) == [201, 409]
    with connect() as db:
        assert db.execute('SELECT COUNT(*) n FROM learning_sessions WHERE child_id=?', (cid,)).fetchone()['n'] == 1
        assert db.execute('SELECT COUNT(*) n FROM sessions WHERE learning_session_id=?', (sid,)).fetchone()['n'] == 1


def test_easy_success_does_not_promote_other_exercises_or_skip_level_two(client, parent_headers):
    cid, animal, food = setup_child(client, parent_headers)
    for _ in range(6):
        client.post('/api/sessions', headers=parent_headers, json=attempt(cid, animal)).raise_for_status()
    prepared = plan(client, parent_headers, cid)
    assert prepared[animal['id']]['difficulty_params']['difficulty_level'] == 2
    assert prepared[food['id']]['difficulty_params']['difficulty_level'] == 1
    assert prepared[food['id']]['assignment_reason']['evidence']['recorded_sessions'] == 0
    # Promotion to four options requires actual results at three options first.
    level_two = prepared[animal['id']]['difficulty_params']
    rounds = level_two['round_count']
    for _ in range(6):
        client.post('/api/sessions', headers=parent_headers, json=attempt(cid, animal,
            attempts_count=rounds, correct_answers=rounds, independent_completions=rounds,
            details={'difficulty_level': 2, 'option_count': level_two['option_count']})).raise_for_status()
    assert plan(client, parent_headers, cid)[animal['id']]['difficulty_params']['difficulty_level'] == 3


def test_old_unknown_or_other_version_results_cannot_raise_difficulty(client, parent_headers):
    cid, animal, _ = setup_child(client, parent_headers)
    for _ in range(6):
        client.post('/api/sessions', headers=parent_headers, json=attempt(cid, animal)).raise_for_status()
    assert plan(client, parent_headers, cid)[animal['id']]['difficulty_params']['difficulty_level'] == 2
    old = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    with connect() as db:
        db.execute('UPDATE sessions SET created_at=? WHERE child_id=?', (old, cid))
    assert plan(client, parent_headers, cid)[animal['id']]['difficulty_params']['difficulty_level'] == 1
    with connect() as db:
        db.execute('UPDATE sessions SET created_at=?,exercise_version_id=NULL WHERE child_id=?', (datetime.now(timezone.utc).isoformat(), cid))
    assert plan(client, parent_headers, cid)[animal['id']]['difficulty_params']['difficulty_level'] == 1
    with connect() as db:
        db.execute("UPDATE sessions SET exercise_version_id=?,details='{}' WHERE child_id=?", (animal['engine']['version_id'], cid))
    assert plan(client, parent_headers, cid)[animal['id']]['difficulty_params']['difficulty_level'] == 1

"""The same recommendation must survive the family → child → specialist workflow."""
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from uuid import uuid4

from app.adaptive_planner import DEFAULT_THRESHOLDS, _difficulty, _evidence
from app.database import connect
from app.exercise_engine import published_exercise_rows
from app.migrations import _migration_25_connected_practice
from app.practice_goals import decode_goal, exercise_matches_goal
from test_privacy_specialist import family, register, consent


@pytest.fixture
def workflow_client(client):
    # Each simulated family workflow has its own client address; do not spend
    # the shared test client's registration quota or disable the rate limiter.
    with TestClient(app, client=("workflow-" + uuid4().hex, 50000)) as browser:
        yield browser


def setup_family(client, admin_headers):
    _, parent, child = family(client)
    consent(client, parent, child, True)
    specialist, _ = register(client, 'linked')
    client.patch(f"/api/admin/users/{specialist['id']}/role", headers=admin_headers, json={'role': 'specialist'}).raise_for_status()
    login = client.post('/api/auth/login', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': specialist['username'], 'password': 'PrivacyTest123!'})
    spec = {'Authorization': f"Bearer {login.json()['access_token']}"}
    client.post(f'/api/children/{child}/specialists', headers=parent, json={'username': specialist['username']}).raise_for_status()
    goal = add_goal(client, parent, child, 'recognise-five-objects')
    return parent, child, specialist, spec, goal


def add_goal(client, parent, child, key):
    response = client.post('/api/practice-goals', headers=parent, json={'child_id': child, 'template_key': key, 'baseline': 'Знакомые предметы', 'help_level': 'minimal'})
    assert response.status_code == 201, response.text
    return response.json()


def recommend(client, spec, child, goal, exercise=7):
    response = client.post('/api/specialist/recommendations', headers=spec, json={'child_id': child, 'goal_id': goal['id'], 'exercise_id': exercise, 'suggested_skill': 'communication', 'comment': 'Попробуйте знакомое задание без спешки'})
    assert response.status_code == 201, response.text
    return response.json()


def decision(client, parent, child, rec, value='accepted', **fields):
    return client.patch(f"/api/children/{child}/specialist-recommendations/{rec['id']}/decision", headers=parent, json={'decision': value, **fields})


def make_plan(client, parent, child, rec):
    response = client.post(f"/api/children/{child}/specialist-recommendations/{rec['id']}/plan", headers=parent)
    assert response.status_code == 201, response.text
    return response.json()


def start(client, auth, child, plan):
    return client.post('/api/learning-sessions', headers=auth, json={'child_id': child, 'exercise_ids': [item['exercise_id'] for item in plan['items']], 'adaptive_plan_id': plan['id'], 'target_minutes': plan['target_minutes']})


def attempt(child, exercise=7, status='completed', session=None, actor='parent', level=1):
    rounds = 12
    return {'child_id': child, 'exercise_id': exercise, 'module': 'sensory', 'score': 100, 'duration_seconds': 12,
            'actor_role': actor, 'response_owner': 'child', 'support_context': 'independent', 'event_id': str(uuid4()),
            'attempt_status': status, 'learning_session_id': session,
            'attempts_count': rounds if status == 'completed' else 0, 'correct_answers': rounds if status == 'completed' else 0,
            'independent_completions': rounds if status == 'completed' else 0, 'prompt_level': 'independent',
            'details': {'difficulty_level': level, 'option_count': level + 1}}


def test_family_acceptance_child_attempt_and_specialist_feedback(workflow_client, admin_headers):
    client = workflow_client
    parent, child, _, spec, goal = setup_family(client, admin_headers)
    first = recommend(client, spec, child, goal)
    second = recommend(client, spec, child, goal)
    assert client.post(f"/api/children/{child}/specialist-recommendations/{first['id']}/plan", headers=parent).status_code == 409
    for rec in (first, second):
        accepted = decision(client, parent, child, rec)
        assert accepted.status_code == 200, accepted.text
    plan = client.post(f'/api/adaptive-plans/{child}', headers=parent, json={'target_minutes': 3}).json()
    assert plan['items'][0]['recommendation_id'] == second['id']
    assert 'family_accepted_recommendation' in plan['items'][0]['assignment_reason']['codes']
    # Ordinary library practice must not complete either recommendation.
    client.post('/api/sessions', headers=parent, json=attempt(child)).raise_for_status()
    assert all(not item['completed_at'] for item in client.get(f'/api/children/{child}/specialist-recommendations', headers=parent).json())
    account = client.post(f'/api/children/{child}/student-account', headers=parent, json={'username': 'linked' + uuid4().hex[:12], 'pin': '1234'}).json()
    login = client.post('/api/auth/student-login', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': account['username'], 'pin': '1234'})
    student = {'Authorization': f"Bearer {login.json()['access_token']}"}
    targeted = make_plan(client, parent, child, first)
    assert len(targeted['items']) == 1
    session = start(client, student, child, targeted)
    assert session.status_code == 201, session.text
    payload = attempt(child, session=session.json()['id'], actor='student')
    saved = client.post('/api/sessions', headers=student, json=payload)
    assert saved.status_code == 201, saved.text
    replay = client.post('/api/sessions', headers=student, json=payload).json()
    assert replay['id'] == saved.json()['id'] and replay['awarded_stars'] == 0
    workspace = client.get(f'/api/specialist/children/{child}', headers=spec).json()
    completed = next(item for item in workspace['recommendations'] if item['id'] == first['id'])
    remaining = next(item for item in workspace['recommendations'] if item['id'] == second['id'])
    assert completed['completed_at'] and completed['attempt_count'] == 1
    assert completed['latest_attempt']['correct_answers'] == 12
    assert not remaining['completed_at'] and remaining['ready_for_plan']
    with connect() as db:
        assignments = {row['recommendation_id']: row['status'] for row in db.execute('SELECT recommendation_id,status FROM assigned_exercises WHERE child_id=?', (child,)).fetchall()}
    assert assignments == {first['id']: 'completed', second['id']: 'assigned'}


def test_goal_contract_blocks_wrong_recommendations_and_pending_content(workflow_client, admin_headers):
    client = workflow_client
    parent, child, _, spec, goal = setup_family(client, admin_headers)
    help_goal = add_goal(client, parent, child, 'aac-ask-for-help')
    exercises = client.get(f'/api/exercises?child_id={child}', headers=parent).json()
    want = next(item for item in exercises if item['target'] == 'request')
    help_exercise = next(item for item in exercises if item['target'] == 'help')
    listed = client.get(f'/api/practice-goals/{child}', headers=parent).json()
    linked = next(item for item in listed if item['id'] == help_goal['id'])['linked_exercises']
    assert [item['id'] for item in linked] == [help_exercise['id']]
    invalid = client.post('/api/specialist/recommendations', headers=spec, json={'child_id': child, 'goal_id': help_goal['id'], 'exercise_id': want['id'], 'suggested_skill': 'communication'})
    assert invalid.status_code == 422
    rec = recommend(client, spec, child, goal)
    assert decision(client, parent, child, rec, goal_id=help_goal['id']).status_code == 422
    other, _, _, _, foreign_goal = setup_family(client, admin_headers)
    assert decision(client, parent, child, rec, goal_id=foreign_goal['id']).status_code == 422
    assert decision(client, other, child, rec).status_code == 403
    with connect() as db:
        template = decode_goal(db.execute('SELECT * FROM parent_practice_goals WHERE id=?', (goal['id'],)).fetchone())
        for target in ('p15-nouns-toys', 'p15-nouns-food', 'p15-nouns-animals', 'p15-nouns-body', 'p15-nouns-clothing', 'p15-nouns-home'):
            assert exercise_matches_goal({'module': 'sensory', 'target': target, 'engine': {'mechanic': 'auditory_choice'}}, template)
        assert not any(item['target'].startswith('p15-') for item in published_exercise_rows(db))


def test_family_decision_withdrawal_and_access_revocation_invalidate_plans(workflow_client, admin_headers):
    client = workflow_client
    parent, child, specialist, spec, goal = setup_family(client, admin_headers)
    rec = recommend(client, spec, child, goal)
    decision(client, parent, child, rec).raise_for_status()
    plan = make_plan(client, parent, child, rec)
    decision(client, parent, child, rec, 'needs_help', note='Нужно показать, как помочь').raise_for_status()
    assert start(client, parent, child, plan).status_code == 409
    workspace = client.get(f'/api/specialist/children/{child}', headers=spec).json()
    assert workspace['recommendations'][0]['family_note'] == 'Нужно показать, как помочь'
    decision(client, parent, child, rec).raise_for_status()
    plan = make_plan(client, parent, child, rec)
    session = start(client, parent, child, plan).json()
    client.delete(f"/api/children/{child}/specialists/{specialist['id']}", headers=parent).raise_for_status()
    assert client.post('/api/sessions', headers=parent, json=attempt(child, session=session['id'])).status_code == 409
    resumed = client.get(f"/api/learning-sessions/{session['id']}", headers=parent).json()
    assert resumed['exercises'] == []
    assert client.patch(f"/api/specialist/recommendations/{rec['id']}", headers=spec, json={'status': 'approved'}).status_code == 403
    client.post(f'/api/children/{child}/specialists', headers=parent, json={'username': specialist['username']}).raise_for_status()
    assert not client.get(f'/api/children/{child}/specialist-recommendations', headers=parent).json()[0]['ready_for_plan']


def test_break_preserves_difficulty_and_only_shortens_current_workload(workflow_client, admin_headers):
    client = workflow_client
    parent, child, _, spec, goal = setup_family(client, admin_headers)
    for _ in range(6):
        client.post('/api/sessions', headers=parent, json=attempt(child, level=2)).raise_for_status()
    with connect() as db:
        exercise = next(item for item in published_exercise_rows(db) if item['id'] == 7)
        before = _evidence(db, child, exercise, DEFAULT_THRESHOLDS)
    assert _difficulty(exercise, before, {'latest_result': None, 'refusals': 0, 'breaks': 0}, 'minimal', DEFAULT_THRESHOLDS)[0]['difficulty_level'] == 3
    client.post('/api/sessions', headers=parent, json=attempt(child, exercise=8, status='break')).raise_for_status()
    rec = recommend(client, spec, child, goal)
    decision(client, parent, child, rec).raise_for_status()
    plan = client.post(f'/api/adaptive-plans/{child}', headers=parent, json={'target_minutes': 10}).json()
    assert len(plan['items']) == 2
    item = next(item for item in plan['items'] if item['exercise_id'] == 7)
    assert item['difficulty_params']['difficulty_level'] == 3
    assert item['assignment_reason']['evidence']['breaks'] == 0
    assert 'не больше двух' in plan['notices'][0]['message']
    client.post('/api/sessions', headers=parent, json=attempt(child, status='refused')).raise_for_status()
    targeted = make_plan(client, parent, child, rec)['items'][0]
    assert targeted['difficulty_params']['difficulty_level'] == 3
    assert targeted['assignment_reason']['evidence']['refusals'] == 1
    # A completed attempt after a break restores the requested workload.
    client.post('/api/sessions', headers=parent, json=attempt(child, level=2)).raise_for_status()
    assert len(client.post(f'/api/adaptive-plans/{child}', headers=parent, json={'target_minutes': 10}).json()['items']) == 3


def test_mapping_migration_versions_existing_goals_without_rewriting_history(workflow_client, admin_headers):
    client = workflow_client
    parent, child, _, _, _ = setup_family(client, admin_headers)
    goal = add_goal(client, parent, child, 'aac-ask-for-help')
    with connect() as db:
        snapshots = [row['snapshot_json'] for row in db.execute('SELECT snapshot_json FROM practice_goal_history WHERE goal_id=? ORDER BY id', (goal['id'],)).fetchall()]
        db.execute('UPDATE parent_practice_goals SET matching_targets_json=? WHERE id=?', (json.dumps(['help', 'request']), goal['id']))
        _migration_25_connected_practice(db)
        updated = db.execute('SELECT * FROM parent_practice_goals WHERE id=?', (goal['id'],)).fetchone()
        assert updated['version'] == goal['version'] + 1
        assert json.loads(updated['matching_targets_json']) == ['help']
        history = db.execute('SELECT * FROM practice_goal_history WHERE goal_id=? ORDER BY id', (goal['id'],)).fetchall()
        assert [row['snapshot_json'] for row in history[:-1]] == snapshots
        assert history[-1]['source'] == 'system_mapping_correction'
        _migration_25_connected_practice(db)
        assert db.execute('SELECT version FROM parent_practice_goals WHERE id=?', (goal['id'],)).fetchone()['version'] == updated['version']


def test_recommendation_pause_is_visible_but_not_completion(workflow_client, admin_headers):
    client = workflow_client
    parent, child, _, spec, goal = setup_family(client, admin_headers)
    rec = recommend(client, spec, child, goal)
    decision(client, parent, child, rec).raise_for_status()
    plan = make_plan(client, parent, child, rec)
    learning = start(client, parent, child, plan).json()
    client.post('/api/sessions', headers=parent, json=attempt(child, status='break', session=learning['id'])).raise_for_status()
    record = client.get(f'/api/specialist/children/{child}', headers=spec).json()['recommendations'][0]
    assert record['latest_attempt']['attempt_status'] == 'break'
    assert record['ready_for_plan'] and not record['completed_at']
    assert client.get(f"/api/learning-sessions/{learning['id']}", headers=parent).json()['status'] == 'paused'


def test_specialist_changes_require_new_family_acceptance(workflow_client, admin_headers):
    client = workflow_client
    parent, child, _, spec, goal = setup_family(client, admin_headers)
    rec = recommend(client, spec, child, goal)
    decision(client, parent, child, rec).raise_for_status()
    plan = make_plan(client, parent, child, rec)
    edited = client.patch(f"/api/specialist/recommendations/{rec['id']}", headers=spec, json={'status': 'edited', 'comment': 'Другая инструкция для семьи'})
    assert edited.status_code == 200, edited.text
    assert start(client, parent, child, plan).status_code == 409
    current = client.get(f'/api/children/{child}/specialist-recommendations', headers=parent).json()[0]
    assert current['is_current'] and current['family_decision'] == 'pending'
    decision(client, parent, child, rec).raise_for_status()
    new_plan = make_plan(client, parent, child, rec)
    client.patch(f"/api/specialist/recommendations/{rec['id']}", headers=spec, json={'status': 'rejected'}).raise_for_status()
    assert start(client, parent, child, new_plan).status_code == 409
    assert decision(client, parent, child, rec).status_code == 409


def test_real_life_totals_include_goal_and_specialist_observations(workflow_client, admin_headers):
    client = workflow_client
    parent, child, _, spec, goal = setup_family(client, admin_headers)
    client.post(f"/api/practice-goals/{goal['id']}/observations", headers=parent, json={'child_id': child, 'result_type': 'independent', 'prompt_level': 'independent', 'note': 'Показал знакомую игрушку'}).raise_for_status()
    client.post(f'/api/specialist/children/{child}/observations', headers=spec, json={'goal_id': goal['id'], 'result_type': 'with_help', 'prompt_level': 'minimal', 'context': 'Во время совместной игры', 'note': 'Показал предмет после жеста'}).raise_for_status()
    summary = client.get(f'/api/results/{child}/summary', headers=parent).json()
    assert summary['real_life_observations'] == 2
    assert summary['gameplay_rounds'] == 0 and summary['independent_completions'] == 0

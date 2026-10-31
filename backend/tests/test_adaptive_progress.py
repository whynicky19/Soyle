from audio_fixtures import approve_fixture_version
from datetime import datetime, timedelta, timezone

from app.adaptive_planner import DEFAULT_THRESHOLDS, _aggregate_results, _difficulty, _evidence, _parent_observation_evidence
from app.database import connect
from test_p21 import _new_child, _add_goal
from test_connected_practice import attempt
from test_varied_mechanics import isolated_database


def family_goal(client, auth):
    child = _new_child(client, auth)['id']
    goal = _add_goal(client, auth, child)
    exercise = next(item for item in client.get('/api/exercises', headers=auth).json() if item['target'] == 'animals')
    return child, goal, exercise


def save(client, auth, child, exercise, level=1, independent=12, prompted=0, **extra):
    payload = attempt(child, exercise=exercise['id'], level=level)
    payload.update(independent_completions=independent, prompted_completions=prompted, correct_answers=independent + prompted, **extra)
    if payload['support_context'] == 'caregiver_modelled':
        payload['prompt_level'] = 'full'
        payload['details']['round_outcomes'] = [{'outcome': value} for value in ['independent'] * independent + ['prompted'] * prompted + ['modelled'] * (12 - independent - prompted)]
    response = client.post('/api/sessions', headers=auth, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def planned_level(child, exercise, observation=None):
    with connect() as db:
        evidence = _evidence(db, child, exercise, DEFAULT_THRESHOLDS)
    observation = observation or {'latest_result': None, 'refusals': 0, 'breaks': 0}
    return _difficulty(exercise, evidence, observation, 'minimal', DEFAULT_THRESHOLDS)[0]['difficulty_level'], evidence


def test_counts_weight_rounds_and_separate_answers_from_independence():
    rows = [dict(attempts_count=12, correct_answers=0, independent_completions=0, prompted_completions=0, prompts_used=0),
            dict(attempts_count=24, correct_answers=24, independent_completions=12, prompted_completions=12, prompts_used=12)]
    result = _aggregate_results(rows, DEFAULT_THRESHOLDS)
    assert result['weighted_accuracy'] == .5
    assert result['weighted_independent_accuracy'] == .25
    assert result['weighted_independence_rate'] == .5


def test_ladder_uses_current_level_and_decreases_one_step(client, parent_headers):
    child, _, exercise = family_goal(client, parent_headers)
    for _ in range(2):
        save(client, parent_headers, child, exercise)
    assert planned_level(child, exercise)[0] == 1
    save(client, parent_headers, child, exercise)
    assert planned_level(child, exercise)[0] == 2
    save(client, parent_headers, child, exercise, 2, 0)
    assert planned_level(child, exercise)[0] == 2
    for _ in range(2):
        save(client, parent_headers, child, exercise, 2, 0)
    assert planned_level(child, exercise)[0] == 1
    # Rebuild on the lower level before attempting three-choice work again.
    for _ in range(3):
        save(client, parent_headers, child, exercise, 1)
    for _ in range(6):
        save(client, parent_headers, child, exercise, 2)
    assert planned_level(child, exercise)[0] == 3
    save(client, parent_headers, child, exercise, 3, 0)
    assert planned_level(child, exercise)[0] == 3
    for _ in range(2):
        save(client, parent_headers, child, exercise, 3, 0)
    assert planned_level(child, exercise)[0] == 2
    other = next(item for item in client.get('/api/exercises', headers=parent_headers).json() if item['target'] == 'food')
    assert planned_level(child, other)[0] == 1


def test_mixed_modelled_series_keeps_real_child_answers_and_never_rewards_model(client, parent_headers):
    child, _, exercise = family_goal(client, parent_headers)
    for _ in range(3):
        save(client, parent_headers, child, exercise, independent=10, prompted=1, support_context='caregiver_modelled')
    level, evidence = planned_level(child, exercise)
    assert level == 2
    assert evidence['recorded_sessions'] == 3
    assert evidence['weighted_accuracy'] == .917
    assert evidence['weighted_independent_accuracy'] == .833
    other, _, _ = family_goal(client, parent_headers)
    for _ in range(3):
        save(client, parent_headers, other, exercise, independent=0, support_context='caregiver_modelled')
    assert planned_level(other, exercise)[0] == 1
    with connect() as db:
        db.execute("UPDATE sessions SET independent_completions=12,correct_answers=12 WHERE child_id=?", (other,))
    assert planned_level(other, exercise)[1]['recorded_sessions'] == 0


def test_observations_expire_and_do_not_reset_current_level(client, parent_headers):
    child, goal, exercise = family_goal(client, parent_headers)
    for _ in range(6):
        save(client, parent_headers, child, exercise, 2)
    def observation(result='with_help', date=None):
        response = client.post(f"/api/practice-goals/{goal['id']}/observations", headers=parent_headers,
                               json={'child_id':child, 'result_type':result, 'prompt_level':'minimal', **({'observed_at':date} if date else {})})
        assert response.status_code == 201, response.text
    observation(date=(datetime.now(timezone.utc) - timedelta(days=40)).isoformat())
    with connect() as db:
        stale = _parent_observation_evidence(db, goal['id'])
    assert stale['count'] == 0
    assert planned_level(child, exercise, stale)[0] == 3
    observation()
    observation('break')
    with connect() as db:
        fresh = _parent_observation_evidence(db, goal['id'])
    assert fresh['latest_result'] == 'break' and fresh['latest_skill_result'] == 'with_help'
    assert planned_level(child, exercise, fresh)[0] == 2
    client.patch(f"/api/practice-goals/{goal['id']}", headers=parent_headers,
                 json={'child_id':child, 'expected_version':goal['version'], 'target_outcome':'Другой наблюдаемый результат'}).raise_for_status()
    with connect() as db:
        assert _parent_observation_evidence(db, goal['id'])['count'] == 0


def test_goal_progress_requires_exact_plan_link_and_deduplicates_replay(client, parent_headers):
    child, goal, exercise = family_goal(client, parent_headers)
    save(client, parent_headers, child, exercise)
    plan = client.post(f'/api/adaptive-plans/{child}', headers=parent_headers, json={'target_minutes':3}).json()
    item = plan['items'][0]
    learning = client.post('/api/learning-sessions', headers=parent_headers,
                          json={'child_id':child, 'exercise_ids':[entry['exercise_id'] for entry in plan['items']], 'target_minutes':3, 'adaptive_plan_id':plan['id']}).json()
    assert 'id' in learning
    client.post('/api/sessions', headers=parent_headers, json=attempt(child, item['exercise_id'], 'break', learning['id'])).raise_for_status()
    client.patch(f"/api/learning-sessions/{learning['id']}/pause", headers=parent_headers, json={"paused":False}).raise_for_status()
    payload = attempt(child, item['exercise_id'], session=learning['id'])
    payload.update(independent_completions=10, prompted_completions=1, correct_answers=11, support_context='caregiver_modelled', prompt_level='full')
    payload['details']['round_outcomes'] = [{'outcome':value} for value in ['independent'] * 10 + ['prompted','modelled']]
    client.post('/api/sessions', headers=parent_headers, json=payload).raise_for_status()
    client.post('/api/sessions', headers=parent_headers, json=payload).raise_for_status()
    record = next(entry for entry in client.get(f'/api/practice-goals/{child}', headers=parent_headers).json() if entry['id'] == goal['id'])
    assert record['status'] == 'active'
    assert record['progress'] == dict(window_days=30, goal_version=1, completed_sessions=1, rounds=12, independent=10,
                                     prompted=1, without_child_answer=1, independent_rate=83, breaks=1, refusals=0,
                                     technical_errors=0, participations=0, home_observations=0, home_independent=0)
    client.patch(f"/api/practice-goals/{goal['id']}", headers=parent_headers,
                 json={'child_id':child, 'expected_version':1, 'status':'paused'}).raise_for_status()
    paused = next(entry for entry in client.get(f'/api/practice-goals/{child}', headers=parent_headers).json() if entry['id'] == goal['id'])
    assert paused['progress']['rounds'] == 12 and paused['progress']['goal_version'] == 2
    client.patch(f"/api/practice-goals/{goal['id']}", headers=parent_headers,
                 json={'child_id':child, 'expected_version':2, 'target_outcome':'Самостоятельно выбирает знакомые предметы'}).raise_for_status()
    updated = next(entry for entry in client.get(f'/api/practice-goals/{child}', headers=parent_headers).json() if entry['id'] == goal['id'])
    assert updated['progress']['rounds'] == 0 and updated['progress']['goal_version'] == 3
    with connect() as db:
        assert db.execute('SELECT COUNT(*) n FROM sessions WHERE child_id=? AND adaptive_plan_item_id=?', (child,item['id'])).fetchone()['n'] == 2


def test_instruction_results_are_no_longer_lost_from_planner_evidence(client, parent_headers, admin_headers, isolated_database):
    drafts = client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
    draft = next(item['version'] for item in drafts if item['version']['mechanic'] == 'tap_instruction')
    approve_fixture_version(draft["id"])
    client.post(f"/api/admin/exercise-drafts/{draft['id']}/publish", headers=admin_headers, json={'comment':'Синтетическая проверка результатов инструкций'}).raise_for_status()
    exercise = next(item for item in client.get('/api/exercises', headers=parent_headers).json() if item['engine']['version_id'] == draft['id'])
    child = _new_child(client, parent_headers)['id']
    _add_goal(client, parent_headers, child, 'follow-one-step-instruction')
    payload = attempt(child, exercise['id'])
    payload.update(independent_completions=11, prompted_completions=1)
    payload['details'] = {'mechanic':'tap_instruction', 'round_count':12,
                          'scenario_outcomes':[{'outcome':'independent'}] * 11 + [{'outcome':'prompted'}]}
    client.post('/api/sessions', headers=parent_headers, json=payload).raise_for_status()
    level, evidence = planned_level(child, exercise)
    assert level == 1  # No invented load levels for this fixed one-step format.
    assert evidence['recorded_sessions'] == 1
    assert evidence['independent_completions'] == 11

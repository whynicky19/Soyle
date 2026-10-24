from copy import deepcopy
from pathlib import Path
import json
import sqlite3

import pytest
from app.database import connect
from app.exercise_engine import validate_version
from app import database, exercise_engine
from app.practice_content import PRACTICE_EXERCISES, WORDS, ACTIONS, GIVE, PUT
from app.practice_goals import PRACTICE_GOAL_TEMPLATES, exercise_matches_goal
from app.schemas import ExerciseDraftCreate
from app.migrations import _migration_26_practice_material, _insert_p15_draft

PUBLIC = Path(__file__).resolve().parents[2] / 'frontend' / 'public'


def test_seven_materials_are_complete_local_and_connected_to_goals():
    assert len(PRACTICE_EXERCISES) == 7
    goals = {item['key']: item for item in PRACTICE_GOAL_TEMPLATES}
    for fixture in PRACTICE_EXERCISES:
        assert validate_version({**fixture, 'language': 'ru'}) == []
        assert fixture['method_card']['methodology_review_status'] == 'pending'
        assert fixture['method_card']['real_life_transfer'] and fixture['method_card']['sources']
        for asset in fixture['content']['asset_registry']:
            assert (PUBLIC / asset['media_ref'].lstrip('/')).stat().st_size > 100
        runtime = {**fixture, 'engine': {'mechanic': fixture['mechanic']}}
        goal = goals['follow-one-step-instruction' if fixture['mechanic'] == 'tap_instruction' else 'recognise-actions' if fixture['mechanic'] == 'action_choice' else 'recognise-five-objects']
        assert exercise_matches_goal(runtime, goal)
    assert WORDS['content']['difficulty_levels'][0]['rounds'] == 4
    assert len(ACTIONS['content']['stimuli']) == 4
    assert all(len(item['exemplars']) == 1 for item in ACTIONS['content']['stimuli'])
    assert {item['key'] for item in ACTIONS['content']['stimuli']} == {'eat', 'drink', 'read', 'play'}


def test_instructions_balance_object_and_destination_and_result_semantics():
    for fixture in (GIVE, PUT):
        scenarios = fixture['content']['scenarios']
        assert len(scenarios) == 4
        pairs = {(item['success']['object_key'], item['success']['target_key']) for item in scenarios}
        assert len(pairs) == 4
        assert all(sum(key == obj for obj, _ in pairs) == 2 for key in ('ball', 'book'))
        assert fixture['completion_rule']['steps'] == 1
    assert {item['result']['relation'] for item in GIVE['content']['scenarios']} == {'give'}
    assert {item['result']['relation'] for item in PUT['content']['scenarios']} == {'in', 'on'}
    wrong = deepcopy(PUT)
    wrong['content']['scenarios'][0]['result']['relation'] = 'on'
    assert any('визуальный результат' in error for error in validate_version({**wrong, 'language': 'ru'}))
    wrong = deepcopy(ACTIONS)
    wrong['content']['stimuli'][0]['exemplars'] = []
    assert validate_version({**wrong, 'language': 'ru'})


def test_authoring_api_preserves_examples_results_and_asset_registry():
    for fixture in (WORDS, ACTIONS, GIVE, PUT):
        draft = ExerciseDraftCreate.model_validate({**fixture, 'language': 'ru'}).model_dump(mode='json')
        assert draft['content']['asset_registry'] == fixture['content']['asset_registry']
        assert validate_version(draft) == []
        if fixture['mechanic'] == 'tap_instruction':
            assert {key: value for key, value in draft['content']['scenarios'][0]['result'].items() if value is not None} == fixture['content']['scenarios'][0]['result']
        else:
            assert draft['content']['stimuli'][0]['exemplars'] == fixture['content']['stimuli'][0]['exemplars']


def test_current_material_is_previewable_and_keeps_existing_visibility(client, admin_headers, student_headers):
    from app.expanded_content import REVISION
    drafts = client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
    public = client.get('/api/exercises', headers=student_headers).json()
    by_target = {item['version']['target']: item for item in drafts}
    published = {item['target']: item for item in public}
    for fixture in PRACTICE_EXERCISES:
        if fixture['target'] in {'animals', 'food', 'toys'}:
            assert published[fixture['target']]['engine']['content']['revision'] == REVISION
        else:
            current = by_target[fixture['target']]
            assert current['valid'] and current['can_publish']
            assert current['version']['content']['revision'] == REVISION
            assert current['version']['publication_status'] == 'draft'
            assert client.post(f"/api/admin/exercise-drafts/{current['version']['id']}/publish", headers=student_headers).status_code == 403


def copy_database(monkeypatch, tmp_path):
    if database.DATABASE_URL:
        pytest.skip('Disposable SQLite review simulation')
    path = tmp_path / 'practice-fixture.db'
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(path) as dest:
        source.backup(dest)
    monkeypatch.setattr(database, 'DB_PATH', path)


def test_after_simulated_review_both_missing_goals_have_a_runnable_plan(client, parent_headers, monkeypatch, tmp_path):
    copy_database(monkeypatch, tmp_path)
    monkeypatch.setattr(exercise_engine, 'ALLOW_UNREVIEWED_DEMO_CONTENT', False)
    # Approval here is only a disposable synthetic test fixture.
    with connect() as db:
        for fixture in (ACTIONS, GIVE, PUT):
            version = db.execute('SELECT id FROM exercise_versions WHERE title=? ORDER BY version DESC LIMIT 1', (fixture['title'],)).fetchone()['id']
            db.execute("UPDATE exercise_versions SET review_status='approved',technical_status='passed',methodology_status='approved',accessibility_status='approved',release_status='approved' WHERE id=?", (version,))
            exercise_engine.publish_version(db, version)
    child = client.post('/api/children', headers=parent_headers, json={'name': 'Практика инструкций', 'birth_date': '2021-01-01'}).json()['id']
    client.put(f'/api/children/{child}/consent', headers=parent_headers, json={'privacy_accepted': True}).raise_for_status()
    for key in ('recognise-actions', 'follow-one-step-instruction'):
        client.post('/api/practice-goals', headers=parent_headers, json={'child_id': child, 'template_key': key, 'baseline': 'Знаком с предметами', 'help_level': 'minimal'}).raise_for_status()
    plan = client.post(f'/api/adaptive-plans/{child}', headers=parent_headers, json={'target_minutes': 5}).json()
    assert {item['exercise_title'] for item in plan['items']} == {ACTIONS['title'], GIVE['title'], PUT['title']}
    assert all(item['difficulty_params']['round_count'] == 12 for item in plan['items']), [(i['exercise_title'], i['difficulty_params']) for i in plan['items']]
    started = client.post('/api/learning-sessions', headers=parent_headers, json={'child_id': child, 'adaptive_plan_id': plan['id'], 'exercise_ids': [item['exercise_id'] for item in plan['items']], 'target_minutes': 5})
    assert started.status_code == 201, started.text
    assert len(started.json()['exercises']) == 3


def test_new_versions_preserve_existing_snapshots_and_migration_is_repeatable(client, monkeypatch, tmp_path):
    copy_database(monkeypatch, tmp_path)
    earlier = deepcopy(WORDS)
    earlier['content']['revision'] = 'synthetic-earlier-review'
    with connect() as db:
        _insert_p15_draft(db, earlier)
        previous = dict(db.execute('SELECT * FROM exercise_versions WHERE title=? ORDER BY version DESC LIMIT 1', (WORDS['title'],)).fetchone())
        _migration_26_practice_material(db)
        assert dict(db.execute('SELECT * FROM exercise_versions WHERE id=?', (previous['id'],)).fetchone()) == previous
        current = dict(db.execute('SELECT * FROM exercise_versions WHERE title=? ORDER BY version DESC LIMIT 1', (WORDS['title'],)).fetchone())
        assert current['version'] == previous['version'] + 1
        assert json.loads(current['content_json'])['revision'] == WORDS['content']['revision']
        count = db.execute('SELECT count(*) n FROM exercise_versions').fetchone()['n']
        _migration_26_practice_material(db)
        assert db.execute('SELECT count(*) n FROM exercise_versions').fetchone()['n'] == count

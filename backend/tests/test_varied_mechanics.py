from audio_fixtures import approve_fixture_version
from copy import deepcopy
from pathlib import Path
import sqlite3
from uuid import uuid4

import pytest
from app import database
from app.adaptive_planner import _evidence, DEFAULT_THRESHOLDS
from app.database import connect
from app.exercise_engine import published_exercise_rows, validate_version
from app.migrations import _migration_30_varied_mechanics
from app.schemas import ExerciseDraftCreate
from app.tts_library import bundled_tts_path
from app.varied_content import VARIED_EXERCISES, GOAL_TEMPLATES, VARIED_SPEECH

PUBLIC = Path(__file__).resolve().parents[2] / 'frontend/public'


def test_complete_distinct_banks_survive_authoring_schema_and_have_local_assets_and_audio():
    for fixture in VARIED_EXERCISES:
        parsed = ExerciseDraftCreate.model_validate(fixture).model_dump()
        assert validate_version(parsed) == []
        for asset in fixture['content']['asset_registry']:
            assert (PUBLIC / asset['media_ref'].lstrip('/')).is_file()
    sort, sequence, match = VARIED_EXERCISES
    assert len(sort['content']['sort_items']) == 24
    assert all(sum(item['category_key'] == group['key'] for item in sort['content']['sort_items']) == 8 for group in sort['content']['categories'])
    assert len(sequence['content']['tasks']) == len(match['content']['tasks']) == 12
    assert [len(task['correct_order']) for task in sequence['content']['tasks']] == [2]*6 + [3]*6
    assert all(len(task['cards']) == len(task['correct_order']) + 1 for task in sequence['content']['tasks'])
    sets = [tuple(sorted(pair['object_key'] for pair in task['pairs'])) for task in match['content']['tasks']]
    assert len(set(sets)) == 12
    assert all(bundled_tts_path(text).is_file() for text in VARIED_SPEECH)


@pytest.mark.parametrize('mechanic', ['category_sort', 'action_sequence', 'object_match'])
def test_invalid_answers_and_missing_asset_registration_block_publication(mechanic):
    item = deepcopy(next(item for item in VARIED_EXERCISES if item['mechanic'] == mechanic))
    if mechanic == 'category_sort':
        item['content']['sort_items'][0]['category_key'] = 'unknown-group'
    elif mechanic == 'action_sequence':
        item['content']['tasks'][0]['correct_order'] = ['wash', 'wash']
    else:
        item['content']['tasks'][0]['pairs'][0] = item['content']['tasks'][0]['pairs'][1]
    assert validate_version(item)
    item = deepcopy(next(item for item in VARIED_EXERCISES if item['mechanic'] == mechanic))
    item['content']['asset_registry'] = []
    assert validate_version(item)


@pytest.fixture
def isolated_database(client, monkeypatch, tmp_path):
    if database.DATABASE_URL:
        pytest.skip('SQLite isolation fixture')
    path = tmp_path / 'varied.db'
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(path) as destination:
        source.backup(destination)
    monkeypatch.setattr(database, 'DB_PATH', path)


@pytest.mark.parametrize('fixture,template', list(zip(VARIED_EXERCISES, GOAL_TEMPLATES)), ids=['sort', 'sequence', 'match'])
def test_admin_publication_links_exact_goal_plan_and_child_result(client, admin_headers, parent_headers, isolated_database, fixture, template):
    drafts = client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
    draft = next(item['version'] for item in drafts if item['version']['target'] == fixture['target'])
    child = client.get('/api/children', headers=parent_headers).json()[0]['id']
    assert fixture['target'] not in {item['target'] for item in client.get('/api/exercises', headers=parent_headers).json()}
    assert client.post(f"/api/admin/exercise-drafts/{draft['id']}/publish", headers=parent_headers).status_code == 403
    approve_fixture_version(draft["id"])
    published = client.post(f"/api/admin/exercise-drafts/{draft['id']}/publish", headers=admin_headers, json={'comment':'Проверено на синтетических данных'})
    assert published.status_code == 200, published.text
    with connect() as db:
        exercise = next(item for item in published_exercise_rows(db) if item['target'] == fixture['target'])
        reviews = db.execute("SELECT stage FROM content_reviews WHERE version_id=? AND reviewer_id IS NOT NULL", (draft['id'],)).fetchall()
        assert [row['stage'] for row in reviews] == ['admin']
    created = client.post('/api/practice-goals', headers=parent_headers, json={'child_id':child, 'template_key':template['key'], 'baseline':'Нужна практика связей', 'help_level':'minimal'})
    assert created.status_code == 201, created.text
    goal = created.json()
    listed = client.get(f'/api/practice-goals/{child}', headers=parent_headers).json()
    linked = next(item for item in listed if item['id'] == goal['id'])
    assert [item['id'] for item in linked['linked_exercises']] == [exercise['id']]
    plan = client.post(f'/api/adaptive-plans/{child}', headers=parent_headers, json={'target_minutes':10})
    assert plan.status_code == 201, plan.text
    related = [item for item in plan.json()['items'] if item['goal_id'] == goal['id']]
    assert related and related[0]['exercise_version_id'] == draft['id']
    assert related[0]['difficulty_params']['round_count'] == fixture['content']['default_rounds']
    started = client.post('/api/learning-sessions', headers=parent_headers, json={
        'child_id':child, 'exercise_ids':[item['exercise_id'] for item in plan.json()['items']],
        'adaptive_plan_id':plan.json()['id'], 'target_minutes':10})
    assert started.status_code == 201, started.text
    rounds = fixture['content']['default_rounds']
    payload = dict(learning_session_id=started.json()['id'], event_id=str(uuid4()), child_id=child, exercise_id=exercise['id'], module='sensory', score=100, duration_seconds=80,
        actor_role='parent', response_owner='child', support_context='caregiver_supported', attempt_status='completed',
        attempts_count=rounds, correct_answers=rounds-1, independent_completions=rounds-2, prompted_completions=1, prompts_used=2,
        details={'mechanic':fixture['mechanic'], 'round_count':rounds, 'round_outcomes':[{'outcome':'independent'}]*(rounds-2)+[{'outcome':'prompted'},{'outcome':'modelled'}]})
    saved = client.post('/api/sessions', headers=parent_headers, json=payload)
    assert saved.status_code == 201, saved.text
    with connect() as db:
        row = db.execute('SELECT * FROM sessions WHERE id=?', (saved.json()['id'],)).fetchone()
        assert row['exercise_version_id'] == draft['id']
        assert row['adaptive_plan_item_id'] == related[0]['id']
        assert row['independent_completions'] == rounds-2
        evidence = _evidence(db, child, exercise, DEFAULT_THRESHOLDS)
        assert evidence['recorded_sessions'] == 1
    # Migration never duplicates a reviewed version or republishes a draft.
    with connect() as db:
        before = db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n']
        _migration_30_varied_mechanics(db)
        assert db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n'] == before


@pytest.mark.parametrize('fixture', VARIED_EXERCISES, ids=['sort', 'sequence', 'match'])
def test_restart_preserves_published_and_archived_admin_decisions(client, admin_headers, parent_headers, isolated_database, fixture):
    drafts = client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
    draft = next(item['version'] for item in drafts if item['version']['target'] == fixture['target'])
    approve_fixture_version(draft["id"])
    assert client.post(f"/api/admin/exercise-drafts/{draft['id']}/publish", headers=admin_headers).status_code == 200
    database.init_db()
    public = client.get('/api/exercises', headers=parent_headers).json()
    found = next(item for item in public if item['target'] == fixture['target'])
    assert found['engine']['version_id'] == draft['id']
    assert found['engine']['review_gate']['approved']
    assert client.delete(f"/api/admin/exercises/{draft['exercise_id']}", headers=admin_headers).status_code == 204
    database.init_db()
    assert fixture['target'] not in {item['target'] for item in client.get('/api/exercises', headers=parent_headers).json()}
    with connect() as db:
        row = db.execute('SELECT is_active FROM exercises WHERE id=?', (draft['exercise_id'],)).fetchone()
        assert row['is_active'] == 0
        assert db.execute('SELECT publication_status FROM exercise_versions WHERE id=?', (draft['id'],)).fetchone()['publication_status'] == 'archived'

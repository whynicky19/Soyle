from copy import deepcopy
from app.observation_content import OBSERVATION_CONTENT, validate_observation
from app.database import connect
from app.exercise_engine import preview_version
from app.migrations import _migration_32_observation_pictures
from test_varied_mechanics import isolated_database
from app.observation_content import OBSERVATION_GOAL
from app.schemas import ExerciseDraftCreate


def test_observation_bank_validates_unique_art_and_distractors():
    assert validate_observation(OBSERVATION_CONTENT) == []
    broken = deepcopy(OBSERVATION_CONTENT)
    broken['scenes'][1]['media_ref'] = broken['scenes'][0]['media_ref']
    broken['scenes'][0]['options'][0] = ['wrong']
    assert len(validate_observation(broken)) == 2


def test_revision_keeps_previous_content_and_needs_admin_decision(client, isolated_database):
    with connect() as db:
        row = db.execute("SELECT v.id,v.exercise_id FROM exercise_versions v JOIN exercises e ON e.id=v.exercise_id WHERE e.target='observation' ORDER BY v.version DESC LIMIT 1").fetchone()
        preview = preview_version(db, row['id'])
        assert preview['valid'], preview['errors']
        assert preview['version']['publication_status'] == 'draft'
        assert preview['version']['admin_review_status'] == 'pending'
        assert len(preview['version']['content']['scenes']) == 24
        before = db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n']
        _migration_32_observation_pictures(db)
        assert db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n'] == before
        assert db.execute('SELECT COUNT(*) n FROM exercise_versions WHERE exercise_id=?', (row['exercise_id'],)).fetchone()['n'] >= 2
        parsed = ExerciseDraftCreate.model_validate(preview['version']).model_dump()
        assert parsed['content']['scenes'] == preview['version']['content']['scenes']
        assert parsed['content']['presentation'] == 'picture_description'


def test_description_goal_selects_published_bank_and_twelve_round_plan(client, admin_headers, parent_headers, isolated_database):
    draft = next(item['version'] for item in client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
                 if item['version']['content'].get('presentation') == 'picture_description')
    assert client.post(f"/api/admin/exercise-drafts/{draft['id']}/publish", headers=admin_headers).status_code == 200
    with connect() as db:
        db.execute("UPDATE exercises SET title='Я вижу',instruction='Старая инструкция' WHERE id=?", (draft['exercise_id'],))
    visible = next(item for item in client.get('/api/exercises', headers=parent_headers).json() if item['id'] == draft['exercise_id'])
    assert visible['title'] == draft['title']
    assert visible['instruction'] == draft['instruction']
    child = client.get('/api/children', headers=parent_headers).json()[0]['id']
    created = client.post('/api/practice-goals', headers=parent_headers, json={'child_id': child,
        'template_key': OBSERVATION_GOAL['key'], 'baseline': 'Начинает с одного слова', 'help_level': 'minimal'})
    assert created.status_code == 201, created.text
    plan = client.post(f'/api/adaptive-plans/{child}', headers=parent_headers, json={'target_minutes':10})
    assert plan.status_code == 201, plan.text
    item = next(item for item in plan.json()['items'] if item['goal_id'] == created.json()['id'])
    assert item['exercise_version_id'] == draft['id']
    assert item['difficulty_params']['round_count'] == 12


def test_complete_phrase_revision_preserves_old_bank_and_is_idempotent(client, isolated_database):
    import json
    from app.migrations import _migration_33_complete_picture_phrases
    with connect() as db:
        old = db.execute("SELECT v.* FROM exercise_versions v JOIN exercises e ON e.id=v.exercise_id WHERE e.target='observation' ORDER BY v.version DESC LIMIT 1").fetchone()
        previous = json.loads(old['content_json'])
        previous['bank_key'] = 'observation-pictures-v2'
        db.execute("UPDATE exercise_versions SET content_json=?,publication_status='published',review_status='approved',admin_review_status='approved' WHERE id=?", (json.dumps(previous),old['id']))
        original = dict(db.execute('SELECT * FROM exercise_versions WHERE id=?',(old['id'],)).fetchone())
        _migration_33_complete_picture_phrases(db)
        newest = dict(db.execute('SELECT * FROM exercise_versions WHERE exercise_id=? ORDER BY version DESC LIMIT 1',(old['exercise_id'],)).fetchone())
        assert newest['version'] == old['version'] + 1
        assert json.loads(newest['content_json'])['bank_key'] == 'observation-pictures-v3'
        assert newest['publication_status'] == 'draft'
        assert newest['admin_review_status'] == 'pending'
        assert dict(db.execute('SELECT * FROM exercise_versions WHERE id=?',(old['id'],)).fetchone()) == original
        _migration_33_complete_picture_phrases(db)
        assert db.execute('SELECT MAX(version) n FROM exercise_versions WHERE exercise_id=?',(old['exercise_id'],)).fetchone()['n'] == newest['version']

from copy import deepcopy
from pathlib import Path
import hashlib
import sqlite3
import pytest

from app import database
from app.database import connect
from app.card_illustrations import CARD_MEDIA, illustrated_content
from app.migrations import _migration_28_card_illustrations
from app.practice_content import GIVE, PUT

PUBLIC = Path(__file__).resolve().parents[2] / 'frontend' / 'public'


def test_all_card_replacements_are_local_rasters_and_generated_assets_are_unique():
    for old, new in CARD_MEDIA.items():
        assert old.endswith(('.svg', '.png'))
        assert new.endswith(('.png', '.webp')) and not new.startswith('/aac-pictograms/')
        assert (PUBLIC / new.lstrip('/')).is_file(), new
    generated = sorted((PUBLIC / 'learning-cards').rglob('*.png'))
    assert len(generated) == 33
    assert len({hashlib.sha256(path.read_bytes()).hexdigest() for path in generated}) == 33
    for fixture in (GIVE, PUT):
        original = deepcopy(fixture['content'])
        updated = illustrated_content(original)
        assert original == fixture['content']
        assert illustrated_content(updated) == updated
        for scenario in updated['scenarios']:
            assert (PUBLIC / scenario['result']['media_ref'].lstrip('/')).is_file()
            assert all(not item['media_ref'].endswith('.svg') for item in scenario['objects'])


def test_active_drafts_have_no_vector_cards_and_old_payloads_remain(client, admin_headers, monkeypatch, tmp_path):
    drafts = client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
    for draft in drafts:
        content = draft['version']['content']
        items = [*content.get('stimuli', []), *(obj for scenario in content.get('scenarios', []) for obj in scenario['objects'])]
        assert all(not item.get('media_ref', '').endswith('.svg') and not item.get('media_ref', '').startswith('/aac-pictograms/') for item in items)
    if database.DATABASE_URL:
        pytest.skip('SQLite repeatability fixture')
    copied = tmp_path / 'raster-repeat.db'
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(copied) as destination:
        source.backup(destination)
    monkeypatch.setattr(database, 'DB_PATH', copied)
    with connect() as db:
        before = [dict(row) for row in db.execute('SELECT * FROM exercise_versions ORDER BY id').fetchall()]
        assert any('.svg' in row['content_json'] and row['publication_status'] == 'archived' for row in before)
        _migration_28_card_illustrations(db)
        after = [dict(row) for row in db.execute('SELECT * FROM exercise_versions ORDER BY id').fetchall()]
        assert before == after


def test_admin_can_publish_home_game_for_parent(client, admin_headers, parent_headers, monkeypatch, tmp_path):
    if database.DATABASE_URL:
        pytest.skip('Disposable SQLite publication fixture')
    copied = tmp_path / 'home-publication.db'
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(copied) as destination:
        source.backup(destination)
    monkeypatch.setattr(database, 'DB_PATH', copied)
    child = client.get('/api/children', headers=parent_headers).json()[0]['id']
    activity = client.get('/api/admin/home-activity-drafts', headers=admin_headers).json()[0]
    url = f"/api/admin/home-activity-drafts/{activity['id']}/publish"
    assert client.post(url, headers=parent_headers).status_code == 403
    assert client.post(url, headers=admin_headers).status_code == 200
    family = client.get(f'/api/home-activities/{child}', headers=parent_headers).json()
    assert activity['id'] in {item['id'] for item in family['activities']}
    assert client.post(url, headers=admin_headers).status_code == 409
    with connect() as db:
        assert db.execute("SELECT COUNT(*) n FROM audit_events WHERE action='home_activity.publish' AND object_id=?", (str(activity['id']),)).fetchone()['n'] == 1

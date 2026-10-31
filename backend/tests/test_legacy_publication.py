from audio_fixtures import approve_fixture_version
from app import exercise_engine
from app.database import connect
from app.exercise_engine import get_version, publish_version
from test_p21 import _new_child, _add_goal
from test_varied_mechanics import isolated_database
from fastapi import HTTPException
import pytest


def test_legacy_publication_can_be_checked_by_admin_without_demo_bypass(client, parent_headers, admin_headers, monkeypatch, isolated_database):
    monkeypatch.setattr(exercise_engine, 'ALLOW_UNREVIEWED_DEMO_CONTENT', False)
    child = _new_child(client, parent_headers)['id']
    _add_goal(client, parent_headers, child)
    before = client.post(f'/api/adaptive-plans/{child}', headers=parent_headers, json={'target_minutes':5}).json()
    assert before['items'] == []
    queue = client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
    legacy = next(item for item in queue if item['version']['target'] == 'animals')
    assert legacy['can_publish'] and legacy['version']['publication_status'] == 'published'
    version_id = legacy['version']['id']
    assert client.post(f'/api/admin/exercise-drafts/{version_id}/publish', headers=parent_headers).status_code == 403
    with connect() as db:
        with pytest.raises(HTTPException) as error:
            publish_version(db, version_id)
        assert error.value.status_code == 409
    approve_fixture_version(version_id)
    response = client.post(f'/api/admin/exercise-drafts/{version_id}/publish', headers=admin_headers, json={'comment':'Проверено на синтетических данных без деморежима'})
    assert response.status_code == 200, response.text
    assert response.json()['admin_review_status'] == 'approved'
    assert response.json()['published_at'] == legacy['version']['published_at']
    after = client.post(f'/api/adaptive-plans/{child}', headers=parent_headers, json={'target_minutes':5}).json()
    assert [item['exercise_id'] for item in after['items']] == [legacy['version']['exercise_id']]
    assert after['notices'] == []
    assert version_id not in [item['version']['id'] for item in client.get('/api/admin/exercise-drafts', headers=admin_headers).json()]
    assert client.post(f'/api/admin/exercise-drafts/{version_id}/publish', headers=admin_headers).status_code == 409
    with connect() as db:
        assert db.execute("SELECT COUNT(*) n FROM content_reviews WHERE version_id=? AND stage='admin' AND decision='approved'",(version_id,)).fetchone()['n'] == 1


def test_legacy_can_be_returned_for_revision(client, admin_headers, monkeypatch, isolated_database):
    monkeypatch.setattr(exercise_engine, 'ALLOW_UNREVIEWED_DEMO_CONTENT', False)
    queue = client.get('/api/admin/exercise-drafts', headers=admin_headers).json()
    legacy = next(item for item in queue if item['version']['target'] == 'animals')['version']
    result = client.post(f"/api/admin/exercise-drafts/{legacy['id']}/reviews", headers=admin_headers,
                         json={'stage':'admin','decision':'changes_requested','comment':'Уточнить подсказку'})
    assert result.status_code == 200, result.text
    assert result.json()['version']['publication_status'] == 'draft'
    assert result.json()['version']['admin_review_status'] == 'changes_requested'
    with connect() as db:
        assert get_version(db, legacy['id'])['is_active'] == 0

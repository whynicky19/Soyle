import copy
import json
import pytest
from app.database import connect
from app.localization import LOCALE, normalize_locale, get_translation, save_translation, approve_translation, TranslationUpdate, TranslationReview, validate_translation, seed_translation_drafts
from app import azure_tts
from fastapi import HTTPException


def test_locale_negotiation():
    assert normalize_locale('kk-KZ,ru;q=0.8') == 'kk-KZ'
    assert normalize_locale('kk') == 'kk-KZ'
    assert normalize_locale('en-US') == 'ru-RU'


def test_settings_preserve_preferences(client, parent_headers):
    before = client.get('/api/settings', headers=parent_headers).json()
    updated = {**before, 'language': 'kk'}
    assert client.put('/api/settings', headers=parent_headers, json=updated).status_code == 200
    assert client.get('/api/settings', headers=parent_headers).json()['language'] == 'kk'
    for field in ('theme','camera_enabled','sound_enabled','calm_mode'):
        assert client.get('/api/settings', headers=parent_headers).json()[field] == before[field]
    assert client.put('/api/settings', headers=parent_headers, json={**updated,'language':'en'}).status_code == 422
    client.put('/api/settings', headers=parent_headers, json=before)


def test_translations_seeded_unapproved_and_immutable(client, admin_headers):
    with connect() as db:
        count = db.execute('SELECT count(*) n FROM exercise_translations').fetchone()['n']
        assert count > 0
        seed_translation_drafts(db)
        assert db.execute('SELECT count(*) n FROM exercise_translations').fetchone()['n'] == count
        row = db.execute('SELECT source_version_id FROM exercise_translations LIMIT 1').fetchone()
        data = get_translation(db, row['source_version_id'])
        assert data['status'] == 'needs_review' and data['reviewed_by'] is None
        validate_translation(data['source'], data['payload'])
        broken = copy.deepcopy(data['payload'])
        broken['content']['stimuli'][0]['key'] = 'wrong-answer'
        with pytest.raises(HTTPException): validate_translation(data['source'], broken)
    kk = {**admin_headers, 'Accept-Language':'kk-KZ'}
    assert client.get('/api/exercises', headers=kk).json() == []
    assert client.get('/api/exercises', headers=admin_headers).json()


def test_translation_revision_and_review_permissions(client, admin_headers, parent_headers):
    queue = client.get('/api/admin/translations', headers=admin_headers).json()
    version_id = next(row['source_version_id'] for row in queue if row['status'] == 'needs_review')
    url = f'/api/admin/translations/{version_id}'
    data = client.get(url, headers=admin_headers).json()
    body = {'revision':data['revision'], 'payload':data['payload'], 'status':'needs_review'}
    assert client.put(url, headers=parent_headers, json=body).status_code == 403
    assert client.put(url, headers=admin_headers, json=body).status_code == 200
    assert client.put(url, headers=admin_headers, json=body).status_code == 409
    assert client.post(url+'/approve', headers=admin_headers, json={'revision':data['revision']+1,'comment':'Reviewed as a test'}).status_code == 403


def test_approved_overlay_keeps_ids_and_original(client):
    from app.exercise_engine import published_exercise_rows
    with connect() as db:
        original = published_exercise_rows(db)
        exercise = next(item for item in original if get_translation(db,item['engine']['version_id'])['status'] == 'needs_review')
        version_id = exercise['engine']['version_id']
        current = get_translation(db, version_id)
        reviewer = db.execute("SELECT id FROM users WHERE role='admin' LIMIT 1").fetchone()['id']
        approve_translation(db,version_id,TranslationReview(revision=current['revision'], comment='Synthetic test review only'),reviewer)
        token = LOCALE.set('kk-KZ')
        try:
            localized = next(item for item in published_exercise_rows(db) if item['id'] == exercise['id'])
            assert localized['engine']['version_id'] == version_id
            assert localized['engine']['language'] == 'kk'
            assert localized['title'] != exercise['title']
            assert [s['key'] for s in localized['engine']['content']['stimuli']] == [s['key'] for s in exercise['engine']['content']['stimuli']]
        finally: LOCALE.reset(token)
        assert published_exercise_rows(db) == original
        approved = get_translation(db,version_id)
        save_translation(db,version_id,TranslationUpdate(revision=approved['revision'],payload=approved['payload']),reviewer)
        assert get_translation(db,version_id)['reviewed_by'] is None
        history = db.execute('SELECT snapshot_json FROM exercise_translation_history WHERE source_version_id=? ORDER BY revision', (version_id,)).fetchall()
        assert len(history) >= 3
        assert any(json.loads(row['snapshot_json'])['status'] == 'approved' for row in history)


def test_errors_are_localized(client, parent_headers):
    response = client.put('/api/settings', headers={**parent_headers,'Accept-Language':'kk-KZ'},json={'language':'bad'})
    assert response.status_code == 422
    assert response.headers['content-language'] == 'kk-KZ'
    assert response.json()['error_code'] == 'validation.invalid'
    assert 'тексеріңіз' in response.json()['detail']


def test_all_pet_phrases_are_in_the_cloud_catalogue():
    assert len(azure_tts.PET_PHRASES['kk']) >= 17
    for text in azure_tts.PET_PHRASES['kk']:
        assert azure_tts.catalogue()[('kk',text)] == text
        ssml = azure_tts.speech_ssml(text,'kk','slow',profile='pet')
        assert 'kk-KZ-AigulNeural' in ssml and 'ru-RU' not in ssml
        assert 'contour=' not in ssml


def test_voice_discovery_fails_closed_and_checks_region(monkeypatch):
    import httpx
    azure_tts._voice_discovery.clear()
    requests = []
    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url, **kwargs):
            requests.append(url)
            return httpx.Response(200,json=[{'ShortName':'ru-RU-SvetlanaNeural'}],request=httpx.Request('GET',url))
    monkeypatch.setattr(azure_tts.httpx,'Client',Client)
    assert not azure_tts.voice_available('test-region','test-key','kk-KZ-AigulNeural')
    assert not azure_tts.voice_available('test-region','test-key','kk-KZ-AigulNeural')
    assert len(requests) == 1
    assert 'test-region.tts.speech.microsoft.com' in requests[0]
    azure_tts._voice_discovery.clear()


def test_kazakh_personal_aac_board_and_composition(client, parent_headers):
    child_id = client.get('/api/children',headers=parent_headers).json()[0]['id']
    kk = {**parent_headers,'Accept-Language':'kk-KZ'}
    created = client.post('/api/aac/cards',headers=kk,json={
        'child_id':child_id,'label':'Су керек','speech':'Су ішкім келеді.',
        'category':'needs','language':'kk',
    })
    assert created.status_code == 201,created.text
    card = created.json()
    board = client.get(f'/api/aac/cards/{child_id}',headers=kk).json()
    assert all(item['language']=='kk' for item in board)
    assert any(item['id']==card['id'] for item in board)
    russian = client.get(f'/api/aac/cards/{child_id}',headers=parent_headers).json()
    assert all(item['id']!=card['id'] for item in russian)
    composed = client.post('/api/aac/compose',headers=kk,json={
        'child_id':child_id,'card_ids':[card['id']],'language':'kk','mode':'free',
    })
    assert composed.status_code == 200 and composed.json()['phrase']=='Су ішкім келеді.'
    mixed = client.post('/api/aac/compose',headers=kk,json={
        'child_id':child_id,'card_ids':[card['id'],russian[0]['id']],'language':'kk',
    })
    assert mixed.status_code == 422


def test_varied_translations_are_complete_pending_and_preserve_scoring_references(client):
    from app.localization import validate_translation,get_translation
    from app.azure_tts import catalogue
    with connect() as db:
        rows=db.execute("SELECT v.id,v.mechanic FROM exercise_versions v JOIN exercise_translations t ON t.source_version_id=v.id WHERE v.mechanic IN ('category_sort','action_sequence','object_match')").fetchall()
        assert {row['mechanic'] for row in rows}=={'category_sort','action_sequence','object_match'}
        for row in rows:
            draft=get_translation(db,row['id'])
            assert draft['status']=='needs_review' and draft['reviewed_by'] is None
            validate_translation(draft['source'],draft['payload'])
            assert draft['payload']['title'] != draft['source']['title']
            assert ('kk',draft['payload']['instruction']) in catalogue()

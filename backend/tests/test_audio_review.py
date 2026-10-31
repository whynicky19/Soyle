import base64
import io
import wave
from copy import deepcopy
from xml.etree import ElementTree as ET

import pytest
from app import audio_review as review
from app import azure_tts as tts
from app.database import connect
from app.core_content import WORD_CORE
import sqlite3
from app import database

@pytest.fixture
def isolated_database(client, monkeypatch, tmp_path):
    if not database.DATABASE_URL:
        copied = tmp_path / "review-test.db"
        with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(copied) as destination:
            source.backup(destination)
        monkeypatch.setattr(database, "DB_PATH", copied)
    yield

from app.exercise_engine import create_draft, get_version, publish_version
from fastapi import HTTPException


from audio_fixtures import wav_data, approve_fixture_audio


@pytest.fixture
def draft(client, admin_headers, isolated_database):
    with connect() as db:
        admin = db.execute("SELECT id FROM users WHERE username='admin'").fetchone()['id']
        payload = {**deepcopy(WORD_CORE), 'language': 'ru'}
        payload['content']['stimuli'] = payload['content']['stimuli'][:2]
        version = create_draft(db, payload, admin)
    yield version, admin
    with connect() as db:
        db.execute("UPDATE exercises SET is_active=0 WHERE id=?", (version["exercise_id"],))


def test_publication_requires_current_approved_audio_and_pins_it(client, admin_headers, parent_headers, draft, monkeypatch):
    version, admin = draft
    version_id = version['id']
    # Test valid full content rather than truncating the fixture's answer bank.
    with connect() as db:
        import json
        db.execute('UPDATE exercise_versions SET content_json=? WHERE id=?', (json.dumps(WORD_CORE['content']), version_id))
    url = f'/api/admin/exercise-drafts/{version_id}'
    denied = client.post(url+'/publish', headers=admin_headers)
    assert denied.status_code == 409
    manifest = client.get(url+'/audio', headers=admin_headers).json()
    item = manifest['items'][0]
    route = f"/api/admin/audio/{version_id}/{item['key']}/{item['mode']}"
    encoded = base64.b64encode(wav_data()).decode()
    body = {'source':'manual','audio_base64':encoded,'expected_digest':None}
    assert client.post(route+'/prepare', headers=parent_headers, json=body).status_code == 403
    candidate = client.post(route+'/prepare', headers=admin_headers, json=body)
    assert candidate.status_code == 200, candidate.text
    digest = candidate.json()['digest']
    assert client.post(route+'/review', headers=admin_headers, json={'digest':digest,'action':'approved'}).status_code == 409
    clip = client.get(route+'/clip', headers=admin_headers)
    assert clip.content == wav_data() and clip.headers['x-soyle-audio-digest'] == digest
    assert client.post(route+'/review', headers=admin_headers, json={'digest':digest,'action':'listened'}).status_code == 200
    assert client.post(route+'/review', headers=admin_headers, json={'digest':digest,'action':'approved'}).status_code == 200
    # The other phrases/mode still block publication.
    assert client.post(url+'/publish', headers=admin_headers).status_code == 409
    with connect() as db: approve_fixture_audio(db, version_id, admin)
    published = client.post(url+'/publish', headers=admin_headers)
    assert published.status_code == 200, published.text
    def no_cloud(*args, **kwargs): raise AssertionError('Reviewed recording must not call Azure')
    monkeypatch.setattr(tts, 'synthesize', no_cloud)
    result = client.post('/api/tts', headers=parent_headers, json={'version_id':version_id,'text':item['text'],'language':item['language'],'mode':item['mode']})
    assert result.status_code == 200 and result.content == wav_data()
    assert result.headers['x-soyle-tts'] == 'reviewed'
    assert client.post(route+'/prepare', headers=admin_headers, json={**body,'expected_digest':digest}).status_code == 409


def test_replacing_candidate_invalidates_listening_and_approval(client, admin_headers, draft):
    version, _ = draft
    item = review.phrases(version)[0]
    route = f"/api/admin/audio/{version['id']}/{item['key']}/normal"
    body={'source':'manual','audio_base64':base64.b64encode(wav_data()).decode()}
    first=client.post(route+'/prepare',headers=admin_headers,json=body).json()['digest']
    client.post(route+'/review',headers=admin_headers,json={'digest':first,'action':'listened'})
    second=client.post(route+'/prepare',headers=admin_headers,json={**body,'audio_base64':base64.b64encode(wav_data(1500)).decode(),'expected_digest':first}).json()['digest']
    assert client.post(route+'/review',headers=admin_headers,json={'digest':first,'action':'approved'}).status_code==409
    assert client.post(route+'/review',headers=admin_headers,json={'digest':second,'action':'approved'}).status_code==409
    assert client.post(route+'/prepare',headers=admin_headers,json={**body,'expected_digest':first}).status_code==409


@pytest.mark.parametrize('language,text',[('ru','Поиграем?'),('kk','Доп')])
def test_global_manual_replacement_only_goes_live_after_approval(client,admin_headers,parent_headers,language,text):
    data=client.get('/api/admin/audio/library',headers=admin_headers,params={'text':text,'language':language}).json()
    item=data['items'][0];route=f"/api/admin/audio/0/{item['key']}/normal"
    body={'source':'manual','audio_base64':base64.b64encode(wav_data(1200)).decode(),'expected_digest':item['recording']['digest'] if item['recording'] else None}
    first=client.post(route+'/prepare',headers=admin_headers,json=body).json()['digest']
    for action in ('listened','approved'):
        assert client.post(route+'/review',headers=admin_headers,json={'digest':first,'action':action}).status_code==200
    payload={'text':text,'language':language,'mode':'normal'}
    live=client.post('/api/tts',headers=parent_headers,json=payload)
    assert live.content==wav_data(1200)
    client.post(route+'/prepare',headers=admin_headers,json={**body,'expected_digest':first,'audio_base64':base64.b64encode(wav_data(1400)).decode()})
    assert client.post('/api/tts',headers=parent_headers,json=payload).content==wav_data(1200)
    with connect() as db:
        db.execute('DELETE FROM speech_library_active WHERE phrase_key=?',(item['key'],))


@pytest.mark.parametrize('raw',[b'not audio',b'<script>alert(1)</script>',b'RIFF\xff\xff\xff\xffWAVE'])
def test_invalid_upload_is_rejected(raw):
    with pytest.raises(HTTPException): review.validate_wav(base64.b64encode(raw).decode())


@pytest.mark.parametrize('text,language,kind',[('Поиграем?','ru','question'),('Поиграем.','ru','statement'),('Жарайсың!','kk','exclamation'),('Тыңда және көрсет','kk','instruction'),('Доп қайда?','kk','question')])
def test_types_punctuation_and_supported_ssml(text,language,kind):
    assert tts.phrase_kind(text,language)==kind
    markup=tts.speech_ssml(text,language,'slow')
    root=ET.fromstring(markup)
    assert ''.join(root.itertext())==text
    assert all(node.tag.rsplit('}',1)[-1] in {'speak','voice','s','prosody','break'} for node in root.iter())
    assert 'express-as' not in markup and 'style=' not in markup
    if language=='kk': assert 'contour=' not in markup
    if text[-1] in '?!.' : assert review.key_for(text,language)!=review.key_for(text.rstrip('?!.'),language)


def test_explicit_instruction_role_survives_duplicate_speech_field():
    text = "Сначала поставь чашку на стол."
    items = review.phrases({"language": "ru", "instruction": text, "content": {"scenarios": [{"instruction": text, "speech": text}]}})
    assert len(items) == 1 and items[0]["phrase_type"] == "instruction"


@pytest.mark.parametrize("language,expected", [
    ("ru", {"Молодец!", "Получилось!", "Отлично!", "Ура!", "Подумай ещё раз.", "Попробуй ещё раз.", "Давай попробуем ещё раз.", "Теперь выбери из двух картинок."}),
    ("kk", {"Жарайсың!", "Тағы бір рет көр.", "Екі суреттің бірін таңда."}),
])
def test_correct_answer_encouragement_is_reviewable_and_in_safe_catalogue(language, expected):
    version = {"language": language, "mechanic": "auditory_choice", "instruction": "", "content": {}}
    actual = {item["text"] for item in review.phrases(version)}
    assert actual == expected
    assert all((language, text) in tts.catalogue() for text in actual)


def test_penguin_recording_cannot_replace_same_text_in_exercise(client, admin_headers, parent_headers, isolated_database):
    digests = {}
    keys = {}
    for profile, sample in (("exercise", 1100), ("pet", 1300)):
        manifest = client.get('/api/admin/audio/library', headers=admin_headers,
                              params={'text': 'Поиграем?', 'profile': profile}).json()
        item = next(item for item in manifest['items'] if item['mode'] == 'normal')
        keys[profile] = item['key']
        route = f"/api/admin/audio/0/{item['key']}/normal"
        result = client.post(route + '/prepare', headers=admin_headers, json={
            'source': 'manual', 'audio_base64': base64.b64encode(wav_data(sample)).decode(),
            'expected_digest': item['recording']['digest'] if item['recording'] else None,
        })
        assert result.status_code == 200
        digest = result.json()['digest']
        digests[profile] = digest
        for action in ('listened', 'approved'):
            assert client.post(route + '/review', headers=admin_headers,
                               json={'digest': digest, 'action': action}).status_code == 200
    assert keys['exercise'] != keys['pet']
    assert digests['exercise'] != digests['pet']
    for profile in ('exercise', 'pet'):
        result = client.post('/api/tts', headers=parent_headers,
                             json={'text': 'Поиграем?', 'profile': profile})
        assert result.status_code == 200
        assert result.headers['x-soyle-audio-digest'] == digests[profile]

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from app import azure_tts as tts
from app.database import connect


@pytest.fixture
def azure(client, monkeypatch):
    monkeypatch.setenv("AZURE_TTS_ENABLED", "true")
    monkeypatch.setenv("AZURE_SPEECH_KEY", "server-only-test-key")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "westeurope")
    with connect() as db:
        db.execute("DELETE FROM tts_cache")
        db.execute("DELETE FROM tts_user_limits")
        db.execute("UPDATE tts_control SET state_json='{}'")
    calls = []
    class Client:
        def __init__(self, **kwargs):
            assert kwargs["timeout"].read == 8
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url, **kwargs):
            return httpx.Response(200, json=[{"ShortName": voice} for voice in tts.VOICES.values()], request=httpx.Request("GET", url))
        def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return httpx.Response(200, content=b"ID3-test-audio")
    monkeypatch.setattr(tts.httpx, "Client", Client)
    yield calls
    with connect() as db:
        db.execute("DELETE FROM tts_user_limits")
        db.execute("UPDATE tts_control SET state_json='{}'")


@pytest.mark.parametrize("language,text,voice", [("ru", "Мяч", "ru-RU-SvetlanaNeural"), ("kk", "Доп", "kk-KZ-AigulNeural")])
@pytest.mark.parametrize("mode,rate", [("normal", "0%"), ("slow", "-15%")])
def test_voices_modes_repeat_cache(azure, client, parent_headers, language, text, voice, mode, rate):
    payload = dict(text=text, language=language, mode=mode)
    for _ in range(2):
        response = client.post("/api/tts", headers=parent_headers, json=payload)
        assert response.status_code == 200
        assert response.headers["x-soyle-tts"] == "azure"
        assert response.headers["content-type"] == "audio/mpeg"
        assert response.content == b"ID3-test-audio"
    assert len(azure) == 1
    ssml = azure[0][1]["content"].decode()
    assert voice in ssml and f'rate="{rate}"' in ssml and 'pitch="+8%"' in ssml
    assert "server-only-test-key" not in response.text


def test_different_modes_have_different_cache_entries(azure):
    for mode in ("normal", "slow", "normal"):
        tts.synthesize("Мяч", "ru", mode)
    assert len(azure) == 2


def test_private_text_never_sent(azure, client, parent_headers):
    response = client.post("/api/tts", headers=parent_headers, json={"text": "Мой ребёнок Иванов, телефон 7777777", "language": "ru"})
    assert response.status_code == 503 and not azure


def test_auth_and_validation(azure, client, parent_headers):
    assert client.post("/api/tts", json={"text": "Мяч"}).status_code in (401, 403)
    for payload in ({"text": " "}, {"text": "x" * 301}, {"text": "Мяч", "language": "de"}, {"text": "Мяч", "mode": "fast"}):
        assert client.post("/api/tts", headers=parent_headers, json=payload).status_code == 422
    assert not azure


def test_concurrent_requests_are_coalesced(azure, monkeypatch):
    original = tts.httpx.Client.post
    def slow(*args, **kwargs):
        time.sleep(.1)
        return original(*args, **kwargs)
    monkeypatch.setattr(tts.httpx.Client, "post", slow)
    barrier = threading.Barrier(4)
    def run(_):
        barrier.wait()
        return tts.synthesize("Доп", "kk", "normal")
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert len(set(pool.map(run, range(4)))) == 1
    assert len(azure) == 1


@pytest.mark.parametrize("status", [401, 429, 500])
def test_azure_failure_cooldown_and_bundled_fallback(azure, monkeypatch, client, parent_headers, status):
    def failure(*args, **kwargs):
        azure.append(status)
        return httpx.Response(status, headers={"Retry-After": "90"})
    monkeypatch.setattr(tts.httpx.Client, "post", failure)
    for _ in range(2):
        response = client.post("/api/tts", headers=parent_headers, json={"text": "Мяч"})
        assert response.status_code == 200
        assert response.headers["x-soyle-tts"] == "bundled"
    assert len(azure) == 1
    with connect() as db:
        state = json.loads(db.execute("SELECT state_json FROM tts_control").fetchone()[0 if db.backend == "sqlite" else "state_json"])
    assert state["cooldown"] > time.time() + 80


def test_timeout_releases_lease(azure, monkeypatch):
    def fail(*args, **kwargs): raise httpx.ReadTimeout("sensitive provider detail")
    monkeypatch.setattr(tts.httpx.Client, "post", fail)
    with pytest.raises(tts.TTSUnavailable): tts.synthesize("Доп", "kk", "normal")
    with connect() as db:
        assert not db.execute("SELECT * FROM tts_cache").fetchall()


@pytest.mark.parametrize("state", [{"calls": [time.time()] * 20}, {"month": tts.datetime.now(tts.timezone.utc).strftime("%Y-%m"), "chars": 500000}])
def test_shared_quota_prevents_cloud_calls(azure, state):
    with connect() as db:
        db.execute("UPDATE tts_control SET state_json=?", (json.dumps(state),))
    with pytest.raises(tts.TTSUnavailable): tts.synthesize("Доп", "kk", "normal")
    assert not azure


def test_per_user_limit_includes_cache_hits(azure, client, parent_headers):
    for _ in range(60):
        assert client.post("/api/tts", headers=parent_headers, json={"text": "Мяч"}).status_code == 200
    response = client.post("/api/tts", headers=parent_headers, json={"text": "Мяч"})
    assert response.status_code == 429 and response.headers["retry-after"] == "60"
    assert len(azure) == 1


def test_manual_correction_is_escaped_and_invalidates_cache(azure, monkeypatch):
    catalogue = {("ru", "Мяч"): "Мяч"}
    monkeypatch.setattr(tts, "catalogue", lambda: catalogue)
    tts.synthesize("Мяч", "ru", "normal")
    catalogue[("ru", "Мяч")] = 'Мя́ч & <voice>'
    tts.synthesize("Мяч", "ru", "normal")
    assert len(azure) == 2
    assert 'Мя́ч &amp; &lt;voice&gt;' in azure[-1][1]["content"].decode()


def test_disabled_flag_uses_bundled_audio(azure, monkeypatch, client, parent_headers):
    monkeypatch.setenv("AZURE_TTS_ENABLED", "false")
    response = client.post("/api/tts", headers=parent_headers, json={"text": "Мяч"})
    assert response.status_code == 200 and response.headers["x-soyle-tts"] == "bundled"
    assert not azure


def test_cached_audio_remains_available_during_provider_cooldown(azure):
    first = tts.synthesize("Мяч", "ru", "normal")
    with connect() as db:
        db.execute("UPDATE tts_control SET state_json=?", (json.dumps({"cooldown": time.time() + 300}),))
    assert tts.synthesize("Мяч", "ru", "normal") == first
    assert len(azure) == 1


def test_frontend_has_no_azure_credentials_or_provider_calls():
    from pathlib import Path
    frontend = Path(__file__).resolve().parents[2] / "frontend"
    for directory in ("app", "lib", "hooks", "components"):
        for path in (frontend / directory).rglob("*.ts*"):
            text = path.read_text()
            assert "AZURE_SPEECH_KEY" not in text, path
            assert "Ocp-Apim-Subscription-Key" not in text, path
            assert ".tts.speech.microsoft.com" not in text, path


def test_sentence_markup_preserves_question_statement_and_stress():
    from xml.etree import ElementTree as ET
    text = "Кто пьёт? Ребёнок пьёт. За́мок & ключ!"
    root = ET.fromstring(tts.speech_ssml(text, "ru", "normal"))
    ns = {"s": "http://www.w3.org/2001/10/synthesis"}
    sentences = root.findall(".//s:s", ns)
    assert len(sentences) == 3
    assert "".join(root.itertext()) == text
    attributes = [node.find("s:prosody", ns).attrib for node in sentences]
    assert attributes[0]["contour"] == tts.QUESTION_CONTOURS["wh"]
    assert attributes[1:] == [{"rate": "0%", "pitch": "+8%"}] * 2
    slow = ET.fromstring(tts.speech_ssml(text, "ru", "slow"))
    assert all(node.attrib["rate"] == "-15%" and node.attrib["pitch"] == "+8%" for node in slow.findall(".//s:prosody", ns))


@pytest.mark.parametrize("text,kind", [
    ("Начнём?", "polar"), ("Ты хочешь пить?", "polar"),
    ("Кто пьёт?", "wh"), ("А где мяч?", "wh"), ("Что делает ребёнок?!", "wh"),
    ("Поиграем.", None), ("Давай поиграем!", None), ("Мяч", None),
])
def test_question_profiles_leave_statements_unchanged(text, kind):
    assert tts.question_contour(text, "ru") == (tts.QUESTION_CONTOURS[kind] if kind else None)
    assert tts.question_contour(text, "kk") is None


def test_mixed_sentences_get_separate_intonation():
    from xml.etree import ElementTree as ET
    text = "Мяч на столе. Поиграем? Где мяч?"
    root = ET.fromstring(tts.speech_ssml(text, "ru", "normal"))
    nodes = root.findall(".//{http://www.w3.org/2001/10/synthesis}prosody")
    assert [node.get("contour") for node in nodes] == [None, tts.SHORT_QUESTION_CONTOURS["поиграем?"], tts.QUESTION_CONTOURS["wh"]]
    assert "".join(root.itertext()) == text


def test_short_invitation_has_its_own_stress_timed_contour():
    from xml.etree import ElementTree as ET
    for mode in ("normal", "slow"):
        root = ET.fromstring(tts.speech_ssml("Поиграем?", "ru", mode))
        node = root.find(".//{http://www.w3.org/2001/10/synthesis}prosody")
        assert node.get("contour") == tts.SHORT_QUESTION_CONTOURS["поиграем?"]
        assert "".join(root.itertext()) == "Поиграем?"
        assert node.get("pitch") == "+8%"
    assert tts.question_contour("Начнём?", "ru") == tts.QUESTION_CONTOURS["polar"]
    assert tts.question_contour("Поиграем.", "ru") is None


def test_question_statement_and_exclamation_have_distinct_cached_audio(azure, monkeypatch):
    texts = ("Поиграем?", "Поиграем.", "Поиграем!")
    monkeypatch.setattr(tts, "catalogue", lambda: {("ru", text): text for text in texts})
    for text in texts * 2:
        tts.synthesize(text, "ru", "normal")
    assert len(azure) == 3
    markup = [call[1]["content"].decode() for call in azure]
    assert len(set(markup)) == 3
    for text, ssml in zip(texts, markup):
        assert text in ssml


@pytest.mark.parametrize("language,text,word", [("ru", "Привет!", "Мяч"), ("kk", "Жарайсың!", "Доп")])
@pytest.mark.parametrize("mode", ["normal", "slow"])
def test_mascot_pitch_does_not_change_learning_words(language, text, word, mode):
    from xml.etree import ElementTree as ET
    ns = "{http://www.w3.org/2001/10/synthesis}"
    for spoken, profile, expected in [(text, "pet", "+22%"), (text, "exercise", "+8%"), (word, "exercise", "+8%"), (text + " " + word, "exercise", "+8%")]:
        root = ET.fromstring(tts.speech_ssml(spoken, language, mode, profile=profile))
        assert "".join(root.itertext()) == spoken
        assert all(node.get("pitch") == expected for node in root.iter(ns + "prosody"))
        assert all(node.get("rate") == ("-15%" if mode == "slow" else "0%") for node in root.iter(ns + "prosody"))
        assert "express-as" not in ET.tostring(root, encoding="unicode")


def test_mascot_timbre_changes_invalidate_cache_and_repeats_reuse_it(azure, monkeypatch):
    tts.synthesize("Привет!", "ru", "normal", profile="pet")
    tts.synthesize("Привет!", "ru", "normal", profile="pet")
    assert len(azure) == 1
    monkeypatch.setattr(tts, "PET_PITCH", "+23%")
    tts.synthesize("Привет!", "ru", "normal", profile="pet")
    assert len(azure) == 2


def test_same_text_has_separate_pet_and_exercise_cache(azure, client, parent_headers):
    for profile in ("pet", "exercise", "pet", "exercise"):
        response = client.post("/api/tts", headers=parent_headers, json={"text": "Поиграем?", "profile": profile})
        assert response.status_code == 200
    assert len(azure) == 2
    assert 'pitch="+22%"' in azure[0][1]["content"].decode()
    assert 'pitch="+8%"' in azure[1][1]["content"].decode()
    assert client.post("/api/tts", headers=parent_headers, json={"text": "Мяч", "profile": "pet"}).status_code == 422


def test_public_kazakh_demo_uses_azure_without_auth_or_arbitrary_text(azure, client):
    response = client.get('/api/public/speech/kk/water')
    assert response.status_code == 200
    assert response.headers['content-language'] == 'kk-KZ'
    assert response.headers['x-soyle-tts'] == 'azure'
    ssml = azure[-1][1]['content'].decode()
    assert 'Су ішкім келеді.' in ssml and 'kk-KZ-AigulNeural' in ssml
    assert 'ru-RU' not in ssml
    assert client.get('/api/public/speech/kk/private-user-text').status_code == 422
    assert len(azure) == 1

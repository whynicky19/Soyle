"""Immutable reviewed recordings, shared by exercise review and runtime speech."""
import base64
import binascii
import hashlib
import io
import json
import wave

from fastapi import HTTPException
from .database import now_iso
from .azure_tts import catalogue, phrase_kind, synthesize, TTSUnavailable
from .tts_library import bundled_tts_path, normalize_tts_text

MODES = ("normal", "slow")


def key_for(text, language):
    return hashlib.sha256(json.dumps([text, language], ensure_ascii=False).encode()).hexdigest()


def phrases(version):
    """Only instructional content, never method cards, profiles or personal data."""
    found = {}
    language = version["language"]
    def add(text, hint=None):
        if not isinstance(text, str) or not text.strip():
            return
        text = normalize_tts_text(text)
        key = key_for(text, language)
        found[key] = dict(key=key, text=text, language=language, phrase_type=phrase_kind(text, language, hint))
    def walk(value, field=""):
        if isinstance(value, dict):
            for name, item in value.items():
                if isinstance(item, str) and name in {"speech", "instruction", "child_instruction", "hint", "feedback", "narration", "label", "empty_hint", "incomplete_hint", "success_hint"}:
                    add(item, "instruction" if name in {"instruction", "child_instruction"} else None)
                elif name == "instructions" and isinstance(item, dict):
                    for text in item.values(): add(text, "instruction")
                elif name == "parts" and isinstance(item, list) and all(isinstance(part, str) for part in item):
                    add(" ".join(item))
                    for text in item: add(text)
                else: walk(item, name)
        elif isinstance(value, list):
            for item in value: walk(item, field)
    add(version["instruction"], "instruction")
    walk(version.get("content") or {})
    return list(found.values())


def targets(db, scope_id, library_text=None, language="ru"):
    if scope_id == 0:
        entries = catalogue()
        if library_text is not None:
            text = normalize_tts_text(library_text)
            if (language, text) not in entries:
                raise HTTPException(422, "Реплика отсутствует в безопасном учебном каталоге")
            return [dict(key=key_for(text, language), text=text, language=language, phrase_type=phrase_kind(text, language))]
        return [dict(key=key_for(text, lang), text=text, language=lang, phrase_type=phrase_kind(text, lang)) for lang, text in entries]
    from .exercise_engine import get_version
    return phrases(get_version(db, scope_id))


def target(db, scope_id, phrase_key):
    item = next((item for item in targets(db, scope_id) if item["key"] == phrase_key), None)
    if not item: raise HTTPException(404, "Реплика не найдена в этой версии")
    return item


def lock_scope(db, scope_id):
    if scope_id:
        # Serialize uploads/approvals/publication for this version.
        db.execute("UPDATE exercise_versions SET title=title WHERE id=?", (scope_id,))
        row = db.execute("SELECT publication_status FROM exercise_versions WHERE id=?", (scope_id,)).fetchone()
        if not row: raise HTTPException(404, "Версия не найдена")
        if row["publication_status"] not in {"draft", "archived"}:
            raise HTTPException(409, "Для изменения опубликованной озвучки создайте новую версию задания")
    else:
        db.execute("UPDATE tts_control SET state_json=state_json WHERE id=1")


def manifest(db, scope_id, library_text=None, language="ru"):
    items = targets(db, scope_id, library_text, language)
    rows = {(row["phrase_key"], row["mode"]): dict(row) for row in db.execute(
        "SELECT phrase_key,mode,digest,source,mime,approved_by,approved_at FROM speech_recordings WHERE scope_id=?", (scope_id,)).fetchall()}
    result = []
    for item in items:
        for mode in MODES:
            row = rows.get((item["key"], mode))
            result.append({**item, "mode": mode, "recording": row})
    return {"scope_id": scope_id, "items": result, "ready": all(item["recording"] and item["recording"]["approved_by"] for item in result)}


def publication_ready(db, version):
    return manifest(db, version["id"])["ready"]


def validate_wav(encoded):
    try:
        audio = base64.b64decode(encoded, validate=True)
        if len(audio) > 2_000_000: raise ValueError()
        with wave.open(io.BytesIO(audio)) as wav:
            if wav.getcomptype() != "NONE" or wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() not in {16000, 22050, 24000, 44100, 48000}:
                raise ValueError()
            if not .1 <= wav.getnframes() / wav.getframerate() <= 30: raise ValueError()
            frames = wav.readframes(wav.getnframes())
            if len(frames) != wav.getnframes() * 2: raise ValueError()
    except (ValueError, binascii.Error, wave.Error, EOFError):
        raise HTTPException(422, "Нужен WAV PCM: моно, 16 бит, 16–48 кГц, 0,1–30 секунд, до 2 МБ") from None
    # Canonicalize: discard all metadata chunks (names/comments) in uploaded files.
    with wave.open(io.BytesIO(audio)) as wav:
        output = io.BytesIO()
        with wave.open(output, "wb") as clean:
            clean.setparams(wav.getparams()); clean.writeframes(frames)
        return output.getvalue()


def prepare_bytes(item, mode, source, encoded=None):
    if source == "manual": return validate_wav(encoded), "audio/wav"
    if source == "bundled":
        if mode != "normal": raise HTTPException(422, "Для медленного режима загрузите отдельную запись или используйте Azure")
        path = bundled_tts_path(item["text"], item["language"])
        if not path.is_file(): raise HTTPException(404, "Готовой записи нет")
        return path.read_bytes(), "audio/wav"
    try:
        # No unreviewed database text is sent to Azure. Manual upload is available.
        return synthesize(item["text"], item["language"], mode, item["phrase_type"]), "audio/mpeg"
    except TTSUnavailable:
        raise HTTPException(503, "Azure недоступен или текст отсутствует в безопасном каталоге. Можно загрузить запись вручную.") from None


def save_candidate(db, scope_id, phrase_key, mode, source, audio, mime, reviewer_id, expected_digest):
    lock_scope(db, scope_id)
    item = target(db, scope_id, phrase_key)
    row = db.execute("SELECT digest FROM speech_recordings WHERE scope_id=? AND phrase_key=? AND mode=?", (scope_id, phrase_key, mode)).fetchone()
    if (row["digest"] if row else None) != expected_digest:
        raise HTTPException(409, "Запись уже изменена. Обновите список и прослушайте её заново")
    digest = hashlib.sha256(audio).hexdigest()
    db.execute("""INSERT INTO speech_recordings(scope_id,phrase_key,mode,text,language,phrase_type,audio_base64,mime,digest,source,prepared_by,approved_by,approved_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)
        ON CONFLICT(scope_id,phrase_key,mode) DO UPDATE SET audio_base64=excluded.audio_base64,mime=excluded.mime,digest=excluded.digest,
        source=excluded.source,prepared_by=excluded.prepared_by,approved_by=NULL,approved_at=NULL,phrase_type=excluded.phrase_type""",
        (scope_id, phrase_key, mode, item["text"], item["language"], item["phrase_type"], base64.b64encode(audio).decode(), mime, digest, source, reviewer_id))
    db.execute("DELETE FROM speech_listens WHERE scope_id=? AND phrase_key=? AND mode=?", (scope_id, phrase_key, mode))
    audit(db, scope_id, phrase_key, mode, digest, "prepared", reviewer_id)
    return {"digest": digest}


def audit(db, scope_id, phrase_key, mode, digest, action, reviewer_id):
    db.execute("INSERT INTO speech_review_events(scope_id,phrase_key,mode,digest,action,reviewer_id,created_at) VALUES(?,?,?,?,?,?,?)",
               (scope_id, phrase_key, mode, digest, action, reviewer_id, now_iso()))


def candidate(db, scope_id, phrase_key, mode):
    target(db, scope_id, phrase_key)
    row = db.execute("SELECT * FROM speech_recordings WHERE scope_id=? AND phrase_key=? AND mode=?", (scope_id, phrase_key, mode)).fetchone()
    if not row: raise HTTPException(404, "Сначала подготовьте запись")
    return dict(row)


def review(db, scope_id, phrase_key, mode, digest, reviewer_id, action):
    lock_scope(db, scope_id)
    row = candidate(db, scope_id, phrase_key, mode)
    if row["digest"] != digest: raise HTTPException(409, "Запись изменилась — прослушайте её заново")
    if action == "listened":
        db.execute("""INSERT INTO speech_listens(scope_id,phrase_key,mode,reviewer_id,digest) VALUES(?,?,?,?,?)
            ON CONFLICT(scope_id,phrase_key,mode,reviewer_id) DO UPDATE SET digest=excluded.digest""", (scope_id, phrase_key, mode, reviewer_id, digest))
    else:
        heard = db.execute("SELECT digest FROM speech_listens WHERE scope_id=? AND phrase_key=? AND mode=? AND reviewer_id=?", (scope_id, phrase_key, mode, reviewer_id)).fetchone()
        if not heard or heard["digest"] != digest: raise HTTPException(409, "Прослушайте эту запись полностью перед утверждением")
        db.execute("UPDATE speech_recordings SET approved_by=?,approved_at=? WHERE scope_id=? AND phrase_key=? AND mode=?", (reviewer_id, now_iso(), scope_id, phrase_key, mode))
    audit(db, scope_id, phrase_key, mode, digest, action, reviewer_id)
    return {"ok": True}


def runtime_recording(db, text, language, mode, version_id, user):
    key = key_for(text, language)
    scopes = [0]
    if version_id is not None:
        from .exercise_engine import get_version, published_exercise
        version = get_version(db, version_id)
        if version["language"] != language: raise HTTPException(422, "Язык не совпадает с заданием")
        if user["role"] != "admin":
            live = published_exercise(db, version["exercise_id"])
            if live["engine"]["version_id"] != version_id: raise HTTPException(404, "Версия недоступна")
        scopes.insert(0, version_id)
    for scope in scopes:
        row = db.execute("SELECT * FROM speech_recordings WHERE scope_id=? AND phrase_key=? AND mode=? AND approved_by IS NOT NULL", (scope, key, mode)).fetchone()
        if row: return dict(row)
    return None

"""Server-only Azure REST synthesis, shared PostgreSQL/SQLite cache and budgets.

Only the static editorial catalogue is eligible for cloud processing. Never add
child profiles, custom AAC cards, or user-entered strings to this catalogue.
"""
import base64
import hashlib
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from xml.sax.saxutils import escape

import httpx
from fastapi import HTTPException

from .database import connect
from .tts_library import known_russian_tts_texts, normalize_tts_text

VOICES = {"ru": "ru-RU-SvetlanaNeural", "kk": "kk-KZ-AigulNeural"}
PUBLIC_DEMO_PHRASES = {
    "ru": {"water": "Я хочу воду.", "apple": "Я хочу яблоко.", "play": "Я хочу играть."},
    "kk": {"water": "Су ішкім келеді.", "apple": "Алма жегім келеді.", "play": "Ойнағым келеді."},
}
FORMAT = "audio-24khz-48kbitrate-mono-mp3"

# Exact mascot lines only: never raise the pitch of a whole lesson containing one.
# This is a stylized female neural voice, not a child voice or unsupported child role.
PET_PHRASES = {
    "ru": frozenset({
        "Привет!", "Давай поиграем!", "Начнём?", "Молодец!", "Получилось!", "Отлично!", "Ура!",
        "Попробуем ещё!", "Давай вместе!", "Я рядом!", "Я помогу!", "Посмотри сюда!",
        "Ура! Мы закончили!", "Здорово!", "Ты старался!", "Я здесь!", "Поиграем?",
        "Подумай ещё раз.", "Попробуй ещё раз.", "Давай попробуем ещё раз.",
    }),
    "kk": frozenset({"Сәлем!", "Кел, ойнайық!", "Бастаймыз ба?", "Жарайсың!", "Қолыңнан келді!", "Тамаша!", "Алақай!", "Тағы ойланып көр.", "Тағы бір рет көр.", "Кел, тағы байқап көрейік.", "Мен көмектесемін!", "Мұнда қара!", "Алақай! Біз аяқтадық!", "Керемет!", "Жақсы тырыстың!", "Мен осындамын!", "Ойнаймыз ба?"}),
}
PET_PITCH = "+22%"



class TTSUnavailable(Exception):
    def __init__(self, retry_after=60):
        self.retry_after = retry_after


@lru_cache(maxsize=1)
def catalogue() -> dict[tuple[str, str], str]:
    from .tts_library import CORE_EXERCISES, PRACTICE_EXERCISES, P15_EXERCISE_DRAFTS
    from .stories import STORIES
    from .interactive_storybook import STORY
    from .cinematic_storybook import DEFINITION
    from .picnic_content import PICNIC
    texts = set(known_russian_tts_texts())
    texts.update(["Привет!", "Давай поиграем!", "Начнём?", "Молодец!", "Получилось!", "Отлично!", "Ура!",
                  "Попробуем ещё!", "Давай вместе!", "Я рядом!", "Я помогу!", "Посмотри сюда!",
                  "Подумай ещё раз.", "Попробуй ещё раз.", "Давай попробуем ещё раз.", "Теперь выбери из двух картинок.",
                  "Ура! Мы закончили!", "Здорово!", "Ты старался!", "Я здесь!", "Поиграем?"])
    fields = {"speech", "text", "instruction", "child_instruction", "narration", "hint", "feedback", "reaction", "label", "prompt", "assisted_reaction"}

    def visit(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in fields and isinstance(item, str):
                    texts.add(item)
                elif isinstance(item, (dict, list, tuple)):
                    visit(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                visit(item)
    visit([CORE_EXERCISES, PRACTICE_EXERCISES, P15_EXERCISE_DRAFTS, STORIES, STORY, DEFINITION, PICNIC])
    result = {("ru", normalize_tts_text(t)): normalize_tts_text(t) for t in texts if 0 < len(normalize_tts_text(t)) <= 300}
    # Generic vocabulary only. This does not translate or publish any exercise.
    for text in ("Доп", "Алма", "Су", "Мысық", "Ит", "Кітап", "Тыңда және көрсет", "Қайтала", "Жарайсың!", "Тағы бір рет көр.", "Екі суреттің бірін таңда."):
        result[("kk", text)] = text
    for text in PET_PHRASES["kk"]:
        result[("kk", text)] = text
    for language, phrases in PUBLIC_DEMO_PHRASES.items():
        for text in phrases.values(): result[(language, text)] = text
    # Version-controlled additions/overrides require a recorded human review.
    for entry in json.loads(Path(__file__).with_name("tts_editorial.json").read_text()):
        if entry.get("reviewed_by") and entry.get("reviewed_at") and entry.get("approved") is True:
            language, text = entry["language"], normalize_tts_text(entry["text"])
            spoken = entry.get("spoken_text", text)
            if language not in VOICES or not 0 < len(text) <= 300 or not 0 < len(spoken) <= 300:
                raise ValueError("Invalid editorial TTS entry")
            result[(language, text)] = spoken
    return result


def enabled():
    return os.getenv("AZURE_TTS_ENABLED", "false").lower() == "true"


def lock_control(db):
    # Row lock on PostgreSQL; write lock on SQLite. No network I/O under the lock.
    db.execute("UPDATE tts_control SET state_json=state_json WHERE id=1")
    return json.loads(db.execute("SELECT state_json FROM tts_control WHERE id=1").fetchone()["state_json"])


def save_control(db, state):
    db.execute("UPDATE tts_control SET state_json=? WHERE id=1", (json.dumps(state),))


def limit_user(user_id: int):
    now = time.time()
    with connect() as db:
        lock_control(db)
        db.execute("DELETE FROM tts_user_limits WHERE started < ?", (now - 60,))
        row = db.execute("SELECT count FROM tts_user_limits WHERE user_id=?", (user_id,)).fetchone()
        if row and row["count"] >= 60:
            raise HTTPException(429, "Слишком много запросов озвучивания", headers={"Retry-After": "60"})
        db.execute("""INSERT INTO tts_user_limits(user_id,started,count) VALUES(?,?,1)
            ON CONFLICT(user_id) DO UPDATE SET count=tts_user_limits.count+1""", (user_id, now))


# Russian questions with a question word usually peak earlier than yes/no questions.
# These are provider hints, not a replacement for listening/editorial review.
RUSSIAN_WH_QUESTION = re.compile(
    r"^(?:(?:а|ну|и)\s+)?(?:кто|что|где|куда|откуда|когда|почему|зачем|как|"
    r"какой|какая|какое|какие|сколько|чей|чья|чьё|чьи|кого|кому|кем|чем|чего|чему|"
    r"который|которая|которое|которые)\b", re.IGNORECASE,
)
QUESTION_CONTOURS = {
    "wh": "(0%,+5%) (20%,+18%) (55%,+0%) (100%,-8%)",
    "polar": "(0%,+0%) (45%,+0%) (75%,+25%) (100%,+8%)",
}

# Per-phrase tuning after listener feedback. Do not apply this timing to other words.
# Native Azure synthesis only; no syllable splicing or post-processing.
SHORT_QUESTION_CONTOURS = {
    "поиграем?": "(0%,+0%) (25%,+0%) (45%,+40%) (60%,+30%) (85%,+0%) (100%,-5%)",
}


def question_contour(sentence: str, language: str) -> str | None:
    # Only explicit editorial question marks trigger this; never rewrite the text.
    if language != "ru":
        return None
    clean = sentence.strip().strip('«»“”"')
    ending = re.search(r"[?!]+$", clean)
    if not ending or "?" not in ending.group():
        return None
    return SHORT_QUESTION_CONTOURS.get(clean.casefold()) or QUESTION_CONTOURS["wh" if RUSSIAN_WH_QUESTION.match(clean) else "polar"]


def phrase_kind(text: str, language: str, hint: str | None = None) -> str:
    clean = text.rstrip().rstrip('»”"')
    punctuation = re.search(r"[.!?]+$", clean)
    ending = punctuation.group() if punctuation else ""
    if "?" in ending: return "question"
    if "!" in ending: return "exclamation"
    if hint == "instruction": return "instruction"
    commands = {"ru": r"^(?:послушай|покажи|найди|повтори|выбери|положи|дай|возьми|нажми)\b",
                "kk": r"^(?:тыңда|көрсет|тап|қайтала|таңда|қой|бер|ал|бас)\b"}
    return "instruction" if re.search(commands.get(language, r"(?!)"), clean, re.I) else "statement"


def speech_ssml(spoken: str, language: str, mode: str, phrase_type: str | None = None, profile: str = "exercise") -> str:
    """Preserve editorial punctuation; give each sentence its own prosodic scope.

    The slight pitch lift is a voice preference, identical at both speeds.
    RU wh-questions peak earlier; polar questions receive a later rise.
    """
    voice = VOICES[language]
    rate = "-15%" if mode == "slow" else "0%"
    pitch = PET_PITCH if profile == "pet" else "+8%"
    sentences = re.split(r"(?<=[.!?])(?=\s|$)", spoken)
    parts = []
    for sentence in sentences:
        if not sentence.strip():
            continue
        kind = phrase_kind(sentence, language, phrase_type)
        pause = {"question": 250, "statement": 150, "exclamation": 200, "instruction": 300}[kind]
        contour = question_contour(sentence, language)
        contour_attribute = f' contour="{contour}"' if contour else ""
        parts.append(f'<s><prosody rate="{rate}" pitch="{pitch}"{contour_attribute}>{escape(sentence)}</prosody><break time="{pause}ms"/></s>')
    body = "".join(parts)
    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{voice[:5]}">'
            f'<voice name="{voice}">{body}</voice></speak>')


def synthesize(text: str, language: str, mode: str, phrase_type: str | None = None, profile: str = "exercise") -> bytes:
    if profile not in {"exercise", "pet"} or (profile == "pet" and normalize_tts_text(text) not in PET_PHRASES.get(language, ())):
        raise TTSUnavailable()
    spoken = catalogue().get((language, normalize_tts_text(text)))
    if not spoken and language == "kk":
        from .localization import approved_speech
        with connect() as db:
            if approved_speech(db, normalize_tts_text(text)): spoken = normalize_tts_text(text)
    key = os.getenv("AZURE_SPEECH_KEY", "")
    region = os.getenv("AZURE_SPEECH_REGION", "")
    if not enabled() or not spoken or not key or not re.fullmatch(r"[a-z0-9-]{2,40}", region):
        raise TTSUnavailable()
    voice = VOICES[language]
    if language == "kk" and not voice_available(region, key, voice):
        raise TTSUnavailable()
    ssml = speech_ssml(spoken, language, mode, phrase_type, profile)
    # Include the complete SSML so voice/intonation edits cannot replay stale audio.
    digest = hashlib.sha256(json.dumps([text, language, voice, mode, ssml, FORMAT, "v2", profile], ensure_ascii=False).encode()).hexdigest()
    token = uuid.uuid4().hex
    deadline = time.monotonic() + 9
    while True:
        now = time.time()
        with connect() as db:
            state = lock_control(db)
            row = db.execute("SELECT * FROM tts_cache WHERE cache_key=?", (digest,)).fetchone()
            if row and row["audio_base64"]:
                return base64.b64decode(row["audio_base64"])
            if not row or row["lease_until"] < now:
                calls = [t for t in state.get("calls", []) if t > now - 60]
                month = datetime.now(timezone.utc).strftime("%Y-%m")
                chars = state.get("chars", 0) if state.get("month") == month else 0
                # Conservative SSML character accounting; reserve failed attempts too.
                if state.get("cooldown", 0) > now or len(calls) >= 20 or chars + len(ssml) > 500_000:
                    raise TTSUnavailable()
                state.update(calls=calls + [now], month=month, chars=chars + len(ssml))
                save_control(db, state)
                db.execute("""INSERT INTO tts_cache(cache_key,audio_base64,lease_until,token) VALUES(?,'',?,?)
                    ON CONFLICT(cache_key) DO UPDATE SET lease_until=excluded.lease_until,token=excluded.token""", (digest, now + 20, token))
                break
        if time.monotonic() >= deadline:
            raise TTSUnavailable(2)
        time.sleep(.05)
    try:
        # A bounded, non-streaming REST call avoids platform-specific SDK binaries.
        with httpx.Client(timeout=httpx.Timeout(8, connect=3), follow_redirects=False, trust_env=False) as client:
            response = client.post(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", headers={
                "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": FORMAT, "User-Agent": "Soyle-TTS",
            }, content=ssml.encode())
        if response.status_code != 200 or not response.content or len(response.content) > 2_000_000:
            retry = response.headers.get("Retry-After", "60")
            raise TTSUnavailable(min(3600, max(60, int(retry))) if retry.isdigit() else 60)
        audio = response.content
        with connect() as db:
            db.execute("UPDATE tts_cache SET audio_base64=?,lease_until=0 WHERE cache_key=? AND token=?", (base64.b64encode(audio).decode(), digest, token))
        return audio
    except (httpx.HTTPError, TTSUnavailable) as exc:
        retry = exc.retry_after if isinstance(exc, TTSUnavailable) else 60
        with connect() as db:
            state = lock_control(db)
            state["cooldown"] = max(state.get("cooldown", 0), time.time() + retry)
            save_control(db, state)
            db.execute("DELETE FROM tts_cache WHERE cache_key=? AND token=?", (digest, token))
        raise TTSUnavailable(retry) from None


# Region-specific discovery; bounded cache, failed discovery does not select a voice.
_voice_discovery = {}

def voice_available(region: str, key: str, voice: str) -> bool:
    cache_key = (region, hashlib.sha256(key.encode()).hexdigest())
    cached = _voice_discovery.get(cache_key)
    if cached and cached[0] > time.monotonic(): return voice in cached[1]
    try:
        with httpx.Client(timeout=httpx.Timeout(8, connect=3), follow_redirects=False, trust_env=False) as client:
            response = client.get(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list", headers={"Ocp-Apim-Subscription-Key": key})
        response.raise_for_status()
        names = {item["ShortName"] for item in response.json() if isinstance(item, dict) and isinstance(item.get("ShortName"), str)}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return False
    if len(_voice_discovery) > 8: _voice_discovery.clear()
    _voice_discovery[cache_key] = (time.monotonic() + 3600, names)
    return voice in names

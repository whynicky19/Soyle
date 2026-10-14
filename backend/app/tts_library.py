import hashlib
from pathlib import Path

from .aac_grammar import compose_aac_phrase
from .database import AAC_CARDS
from .exercise_engine import AAC_SCENARIOS, SENSORY_CONTENT
from .p1_content import ACTION_RUNNER_DRAFT, INSTRUCTION_RUNNER_DRAFT, WORD_RUNNER_DRAFT
from .p15_content import P15_EXERCISE_DRAFTS


BUNDLED_TTS_DIR = Path(__file__).with_name("tts_audio")

SUBJECT_LABELS = {"Я", "Мама", "Папа", "Бабушка", "Дедушка", "Брат", "Сестра"}
ACTION_LABELS = {"Хочу", "Люблю", "Вижу", "Иду", "Играю", "Рисовать", "Читать", "Спать", "Гулять", "Играл", "Гулял"}
OBJECT_LABELS = {"Сок", "Вода", "Чай", "Яблоко", "Банан", "Хлеб", "Суп", "Каша", "Мяч", "Машинка", "Кукла", "Книга", "Пазл", "Кот"}


def normalize_tts_text(text: str) -> str:
    return " ".join(text.split()).strip()


def bundled_tts_path(text: str, language: str = "ru") -> Path:
    normalized = normalize_tts_text(text)
    digest = hashlib.sha256(f"{language}|{normalized}".encode("utf-8")).hexdigest()
    return BUNDLED_TTS_DIR / f"{digest}.wav"


def _aac_cards() -> dict[str, dict[str, str]]:
    cards: dict[str, dict[str, str]] = {}
    for label, speech, *_ in AAC_CARDS:
        role = "ready_message"
        if label in SUBJECT_LABELS:
            role = "subject"
        elif label in ACTION_LABELS:
            role = "action"
        elif label in OBJECT_LABELS:
            role = "object"
        cards[label] = {"label": label, "speech": speech, "language": "ru", "grammatical_role": role}
    return cards


def _exercise_speech(exercise: dict) -> set[str]:
    content = exercise.get("content") or {}
    texts = {
        str(item.get("speech") or "")
        for item in content.get("stimuli", [])
        if item.get("speech")
    }
    texts.update(
        str(item.get("speech") or "")
        for item in content.get("scenarios", [])
        if item.get("speech")
    )
    return texts


def known_russian_tts_texts() -> tuple[str, ...]:
    texts = {"Получилось."}
    cards = _aac_cards()
    texts.update(card["speech"] for card in cards.values())

    for scenario in AAC_SCENARIOS.values():
        for labels in scenario.get("accepted_sequences", []):
            if not all(label in cards for label in labels):
                continue
            composed = compose_aac_phrase([cards[label] for label in labels], "ru")
            if composed.get("valid") and composed.get("phrase"):
                texts.add(str(composed["phrase"]))

    for stimuli in SENSORY_CONTENT.values():
        for item in stimuli:
            speech = str(item.get("speech") or item.get("label") or "")
            if speech:
                texts.add(speech)
                texts.add(f"Это {speech.lower()}.")

    for exercise in (WORD_RUNNER_DRAFT, ACTION_RUNNER_DRAFT, INSTRUCTION_RUNNER_DRAFT, *P15_EXERCISE_DRAFTS):
        texts.update(_exercise_speech(exercise))

    return tuple(sorted({normalize_tts_text(text) for text in texts if normalize_tts_text(text)}))

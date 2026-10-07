from typing import Any


LANGUAGE_PATTERNS: dict[str, list[tuple[str, ...]]] = {
    "ru": [("subject", "action", "object"), ("action", "object"), ("subject", "action")],
    "en": [("subject", "action", "object"), ("action", "object"), ("subject", "action")],
    "kk": [("subject", "object", "action"), ("object", "action"), ("subject", "action")],
}


def compose_aac_phrase(cards: list[dict[str, Any]], language: str) -> dict[str, Any]:
    if language not in LANGUAGE_PATTERNS:
        return {"valid": False, "phrase": "", "reason": "Этот язык пока не поддерживается шаблонами AAC"}
    if not cards:
        return {"valid": False, "phrase": "", "reason": "Выберите хотя бы одну карточку"}
    card_languages = {card.get("language") or "ru" for card in cards}
    if card_languages != {language}:
        return {"valid": False, "phrase": "", "reason": "Карточки разных языков нельзя объединить в одно сообщение"}
    roles = tuple(card.get("grammatical_role") or "ready_message" for card in cards)
    if len(cards) == 1:
        phrase = str(cards[0].get("speech") or cards[0].get("label") or "").strip()
        return {"valid": bool(phrase), "phrase": phrase, "reason": "" if phrase else "У карточки нет формы для озвучивания"}
    if "ready_message" in roles:
        return {"valid": False, "phrase": "", "reason": "Готовое важное сообщение используется отдельно"}
    matching_pattern = next((pattern for pattern in LANGUAGE_PATTERNS[language] if roles == pattern), None)
    if not matching_pattern:
        return {"valid": False, "phrase": "", "reason": "Эта последовательность карточек пока не входит в проверенные шаблоны"}
    phrase = " ".join(str(card.get("speech") or card.get("label") or "").strip() for card in cards).strip()
    if language in {"ru", "en"}:
        phrase = phrase[:1].upper() + phrase[1:]
    return {"valid": True, "phrase": phrase, "reason": "", "pattern": "+".join(matching_pattern)}

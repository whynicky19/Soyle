from typing import Any


LANGUAGE_PATTERNS: dict[str, list[tuple[str, ...]]] = {
    "ru": [("subject", "action", "object"), ("action", "object"), ("subject", "action")],
    "en": [("subject", "action", "object"), ("action", "object"), ("subject", "action")],
    "kk": [("subject", "object", "action"), ("object", "action"), ("subject", "action")],
}

RUSSIAN_SEEN_OBJECT_FORMS = {
    "Мама": "маму",
    "Папа": "папу",
    "Бабушка": "бабушку",
    "Дедушка": "дедушку",
    "Брат": "брата",
    "Сестра": "сестру",
    "Кот": "кота",
}


def _compose_russian_observation(cards: list[dict[str, Any]]) -> str | None:
    labels = [str(card.get("label") or "") for card in cards]
    if len(labels) == 2 and labels[0] == "Вижу":
        target_index = 1
    elif len(labels) == 3 and labels[:2] == ["Я", "Вижу"]:
        target_index = 2
    else:
        return None
    target = cards[target_index]
    object_form = RUSSIAN_SEEN_OBJECT_FORMS.get(labels[target_index]) or str(target.get("speech") or "").strip()
    if not object_form:
        return None
    return f"Вижу {object_form}" if target_index == 1 else f"Я вижу {object_form}"


def _compose_aac_phrase(cards: list[dict[str, Any]], language: str, mode: str = "guided") -> dict[str, Any]:
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
    if language == "kk":
        from .aac_kazakh import compose
        phrase = compose(cards)
        if phrase: return {"valid": True,"phrase":phrase,"reason":"","pattern":"kk.semantic"}
    if mode == "free":
        guided = compose_aac_phrase(cards, language)
        if guided["valid"]:
            return guided
        phrase = " ".join(str(card.get("speech") or card.get("label") or "").strip() for card in cards)
        phrase = " ".join(phrase.split())
        return {"valid": bool(phrase), "phrase": phrase, "reason": "" if phrase else "У карточек нет текста для озвучивания"}
    if language == "kk":
        return {"valid":False,"phrase":"","reason":"Эта последовательность карточек пока не входит в проверенные шаблоны"}
    observation = _compose_russian_observation(cards) if language == "ru" else None
    if observation:
        return {"valid": True, "phrase": observation, "reason": "", "pattern": "observation"}
    if "ready_message" in roles:
        return {"valid": False, "phrase": "", "reason": "Готовое важное сообщение используется отдельно"}
    matching_pattern = next((pattern for pattern in LANGUAGE_PATTERNS[language] if roles == pattern), None)
    if not matching_pattern:
        return {"valid": False, "phrase": "", "reason": "Эта последовательность карточек пока не входит в проверенные шаблоны"}
    phrase = " ".join(str(card.get("speech") or card.get("label") or "").strip() for card in cards).strip()
    if language in {"ru", "en"}:
        phrase = phrase[:1].upper() + phrase[1:]
    return {"valid": True, "phrase": phrase, "reason": "", "pattern": "+".join(matching_pattern)}


_KK_REASONS = {
    "Этот язык пока не поддерживается шаблонами AAC":"Бұл тілдің AAC үлгілері әзірге қолдау таппайды.",
    "Выберите хотя бы одну карточку":"Кемінде бір карточканы таңдаңыз.",
    "Карточки разных языков нельзя объединить в одно сообщение":"Әртүрлі тілдегі карточкаларды бір хабарламаға біріктіруге болмайды.",
    "У карточки нет формы для озвучивания":"Карточкада дыбысталатын мәтін жоқ.",
    "У карточек нет текста для озвучивания":"Карточкаларда дыбысталатын мәтін жоқ.",
    "Готовое важное сообщение используется отдельно":"Дайын маңызды хабарлама бөлек қолданылады.",
    "Эта последовательность карточек пока не входит в проверенные шаблоны":"Бұл карточкалар ретіне әзірге қолдау көрсетілмейді.",
}

def compose_aac_phrase(cards,language,mode="guided"):
    result=_compose_aac_phrase(cards,language,mode)
    if language=="kk" and result.get("reason"):result["reason"]=_KK_REASONS.get(result["reason"],"Карточкаларды тексеріңіз.")
    return result

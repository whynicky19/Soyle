import json
import re
import secrets
from typing import Any

from fastapi import HTTPException

from .database import now_iso


SUPPORTED_PUBLIC_MECHANICS = frozenset({"auditory_choice", "guided_aac"})

SENSORY_CONTENT: dict[str, list[dict[str, str]]] = {
    "animals": [
        {"key": "cat", "label": "Кот", "speech": "Кот", "hint": "Домашнее животное, которое мяукает", "media_ref": "/aac-pictograms/cat.png"},
        {"key": "dog", "label": "Собака", "speech": "Собака", "hint": "Домашнее животное, которое лает", "visual_token": "dog"},
        {"key": "fish", "label": "Рыба", "speech": "Рыба", "hint": "Она живёт в воде", "visual_token": "fish"},
        {"key": "bird", "label": "Птица", "speech": "Птица", "hint": "У неё есть крылья", "visual_token": "bird"},
        {"key": "rabbit", "label": "Кролик", "speech": "Кролик", "hint": "У него длинные уши", "visual_token": "rabbit"},
        {"key": "turtle", "label": "Черепаха", "speech": "Черепаха", "hint": "У неё есть панцирь", "visual_token": "turtle"},
        {"key": "snail", "label": "Улитка", "speech": "Улитка", "hint": "Она носит домик на спине", "visual_token": "snail"},
        {"key": "bug", "label": "Жук", "speech": "Жук", "hint": "Маленькое насекомое", "visual_token": "bug"},
    ],
    "food": [
        {"key": "apple", "label": "Яблоко", "speech": "Яблоко", "hint": "Фрукт круглой формы", "media_ref": "/aac-pictograms/apple.png"},
        {"key": "banana", "label": "Банан", "speech": "Банан", "hint": "Длинный жёлтый фрукт", "media_ref": "/aac-pictograms/banana.png"},
        {"key": "milk", "label": "Молоко", "speech": "Молоко", "hint": "Белый напиток", "visual_token": "milk"},
        {"key": "juice", "label": "Сок", "speech": "Сок", "hint": "Фруктовый напиток", "media_ref": "/aac-pictograms/juice.png"},
        {"key": "water", "label": "Вода", "speech": "Вода", "hint": "Прозрачный напиток", "media_ref": "/aac-pictograms/water.png"},
        {"key": "soup", "label": "Суп", "speech": "Суп", "hint": "Его едят ложкой", "media_ref": "/aac-pictograms/soup.png"},
        {"key": "bread", "label": "Хлеб", "speech": "Хлеб", "hint": "Его нарезают кусочками", "media_ref": "/aac-pictograms/bread.png"},
        {"key": "porridge", "label": "Каша", "speech": "Каша", "hint": "Её едят из тарелки", "media_ref": "/aac-pictograms/porridge.png"},
    ],
    "toys": [
        {"key": "ball", "label": "Мяч", "speech": "Мяч", "hint": "Круглая игрушка", "media_ref": "/aac-pictograms/ball.png"},
        {"key": "toy-car", "label": "Машинка", "speech": "Машинка", "hint": "Игрушка на колёсах", "media_ref": "/aac-pictograms/toy-car.png"},
        {"key": "blocks", "label": "Кубики", "speech": "Кубики", "hint": "Из них можно строить", "visual_token": "blocks"},
        {"key": "doll", "label": "Кукла", "speech": "Кукла", "hint": "Игрушка в виде человека", "media_ref": "/aac-pictograms/doll.png"},
        {"key": "book", "label": "Книга", "speech": "Книга", "hint": "В ней рассматривают картинки и читают", "media_ref": "/aac-pictograms/book.png"},
        {"key": "puzzle", "label": "Пазл", "speech": "Пазл", "hint": "Картинка из частей", "media_ref": "/aac-pictograms/puzzle.png"},
        {"key": "paint", "label": "Краски", "speech": "Краски", "hint": "Ими рисуют", "media_ref": "/aac-pictograms/draw.png"},
        {"key": "drum", "label": "Барабан", "speech": "Барабан", "hint": "Игрушечный музыкальный инструмент", "visual_token": "drum"},
    ],
}

AAC_SCENARIOS: dict[str, dict[str, Any]] = {
    "request": {"title": "Попросить предмет", "labels": ["Хочу", "Сок", "Вода", "Мяч", "Книга"]},
    "choice": {"title": "Сделать выбор", "labels": ["Сок", "Вода"]},
    "refusal": {"title": "Отказаться", "labels": ["Нет", "Стоп", "Не хочу"]},
    "feelings": {"title": "Сообщить о состоянии", "labels": ["Больно", "Устал", "Весело", "Грустно", "Спокойно", "Злюсь", "Страшно"]},
    "help": {"title": "Попросить помощь", "labels": ["Помоги"]},
    "answer": {"title": "Ответить", "labels": ["Да", "Нет"]},
    "observation": {"title": "Прокомментировать", "labels": ["Я", "Мама", "Папа", "Кот", "Вижу", "Играю"]},
    "past_event": {"title": "Сообщить о событии", "labels": ["Я", "Вчера", "Играл", "Гулял", "Мяч"]},
    "question": {"title": "Задать вопрос", "labels": ["Что это?", "Где?"]},
    "routine": {"title": "Рассказать о дне", "labels": ["Есть", "Пить", "Играю", "Гулять", "Читать", "Спать"]},
}


def legacy_engine_payload(exercise: dict) -> dict[str, Any]:
    module = exercise["module"]
    target = exercise["target"]
    if module == "sensory":
        return {
            "mechanic": "auditory_choice",
            "objective": "Сопоставить услышанное слово с изображением знакомого предмета",
            "response_mode": "single_tap",
            "prompt_policy": {"steps": ["repeat_audio", "reduced_choice", "model_answer"], "time_limit": None},
            "completion_rule": {"rounds": 5, "success": "matching_stimulus_key"},
            "content": {"stimuli": SENSORY_CONTENT.get(target, [])},
        }
    if module == "mixed":
        scenario = AAC_SCENARIOS.get(target, {})
        return {
            "mechanic": "guided_aac",
            "objective": "Поддержать функциональное сообщение доступным способом",
            "response_mode": "aac_card_sequence",
            "prompt_policy": {"adult_levels": ["independent", "minimal", "full"], "time_limit": None},
            "completion_rule": {"success": "accepted_communication", "refusal_is_valid": True},
            "content": {"scenario_key": target, "title": scenario.get("title", exercise["title"]), "labels": scenario.get("labels", [])},
        }
    return {
        "mechanic": "local_face_mirror",
        "objective": "Внутренняя прототипная проверка движения перед зеркалом",
        "response_mode": "local_camera_signal",
        "prompt_policy": {"time_limit_seconds": 10},
        "completion_rule": {"success": "local_movement_signal"},
        "content": {"movement": target},
    }


def validate_version(version: dict) -> list[str]:
    errors: list[str] = []
    for field, label in (
        ("title", "название"),
        ("objective", "наблюдаемая цель"),
        ("instruction", "инструкция"),
        ("response_mode", "способ ответа"),
    ):
        if not str(version.get(field) or "").strip():
            errors.append(f"Не заполнено поле: {label}")
    mechanic = version.get("mechanic")
    if mechanic not in SUPPORTED_PUBLIC_MECHANICS:
        errors.append("У выбранной механики нет разрешённого публичного проигрывателя")
    if version.get("language") != "ru":
        errors.append("Публикация разрешена только для проверенного русского контента")
    if not isinstance(version.get("prompt_policy"), dict) or not version.get("prompt_policy"):
        errors.append("Не определены правила подсказок")
    if not isinstance(version.get("completion_rule"), dict) or not version.get("completion_rule"):
        errors.append("Не определены правила завершения")

    content = version.get("content") if isinstance(version.get("content"), dict) else {}
    if mechanic == "auditory_choice":
        stimuli = content.get("stimuli") if isinstance(content, dict) else None
        if not isinstance(stimuli, list) or not 3 <= len(stimuli) <= 12:
            errors.append("Для выбора на слух нужны от 3 до 12 стимулов")
        else:
            keys: list[str] = []
            labels: list[str] = []
            for index, stimulus in enumerate(stimuli, start=1):
                if not isinstance(stimulus, dict):
                    errors.append(f"Стимул {index} имеет неверный формат")
                    continue
                key = str(stimulus.get("key") or "").strip()
                label = str(stimulus.get("label") or "").strip()
                speech = str(stimulus.get("speech") or "").strip()
                if not key or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,49}", key):
                    errors.append(f"Стимул {index}: нужен стабильный латинский key")
                if not label or not speech:
                    errors.append(f"Стимул {index}: нужны подпись и озвучиваемый текст")
                if not stimulus.get("media_ref") and not stimulus.get("visual_token"):
                    errors.append(f"Стимул {index}: нужна локальная иллюстрация или проверенный visual_token")
                if stimulus.get("media_ref") and not str(stimulus["media_ref"]).startswith("/"):
                    errors.append(f"Стимул {index}: разрешены только локальные media_ref")
                keys.append(key.lower())
                labels.append(label.casefold())
            if len(keys) != len(set(keys)):
                errors.append("Ключи стимулов не должны повторяться")
            if len(labels) != len(set(labels)):
                errors.append("Подписи стимулов не должны повторяться")
        if version.get("response_mode") != "single_tap":
            errors.append("Механика выбора на слух требует response_mode=single_tap")
        if version.get("completion_rule", {}).get("success") != "matching_stimulus_key":
            errors.append("Правильный ответ должен определяться ключом стимула, а не позицией картинки")
    elif mechanic == "guided_aac":
        labels = content.get("labels") if isinstance(content, dict) else None
        if not isinstance(labels, list) or not labels:
            errors.append("Для guided AAC нужен непустой список допустимых карточек")
    return errors


def _decode_version(row: dict) -> dict:
    result = dict(row)
    result["prompt_policy"] = json.loads(result.pop("prompt_policy_json") or "{}")
    result["completion_rule"] = json.loads(result.pop("completion_rule_json") or "{}")
    result["content"] = json.loads(result.pop("content_json") or "{}")
    return result


def published_exercise_rows(db) -> list[dict]:
    rows = db.execute(
        """SELECT e.*,v.id exercise_version_id,v.version content_version,v.mechanic,v.language,
                  v.objective,v.response_mode,v.prompt_policy_json,v.completion_rule_json,v.content_json,
                  v.review_status,v.publication_status
           FROM exercises e
           JOIN exercise_versions v ON v.exercise_id=e.id
           WHERE e.is_active=1 AND v.review_status='approved' AND v.publication_status='published'
             AND v.mechanic<>'local_face_mirror'
             AND v.version=(SELECT MAX(v2.version) FROM exercise_versions v2
                            WHERE v2.exercise_id=e.id AND v2.review_status='approved'
                              AND v2.publication_status='published')
           ORDER BY e.module,e.difficulty,e.id"""
    ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["engine"] = {
            "version_id": item.pop("exercise_version_id"),
            "version": item.pop("content_version"),
            "mechanic": item.pop("mechanic"),
            "language": item.pop("language"),
            "objective": item.pop("objective"),
            "response_mode": item.pop("response_mode"),
            "prompt_policy": json.loads(item.pop("prompt_policy_json") or "{}"),
            "completion_rule": json.loads(item.pop("completion_rule_json") or "{}"),
            "content": json.loads(item.pop("content_json") or "{}"),
            "review_status": item.pop("review_status"),
            "publication_status": item.pop("publication_status"),
        }
        result.append(item)
    return result


def published_exercise(db, exercise_id: int) -> dict | None:
    return next((item for item in published_exercise_rows(db) if item["id"] == exercise_id), None)


def create_draft(db, payload: dict, created_by: int) -> dict:
    target = f"draft-{secrets.token_hex(8)}"
    module = payload["module"]
    icon = "/illustrations/module-listening.png" if module == "sensory" else "/illustrations/module-phrases.png"
    cursor = db.execute(
        """INSERT INTO exercises(module,title,instruction,difficulty,target,icon,skill,is_active)
           VALUES(?,?,?,?,?,?,?,0) RETURNING id""",
        (module, payload["title"], payload["instruction"], payload["difficulty"], target, icon, payload["skill"]),
    )
    exercise_id = cursor.fetchone()["id"]
    cursor = db.execute(
        """INSERT INTO exercise_versions(
               exercise_id,version,title,mechanic,language,objective,instruction,response_mode,
               prompt_policy_json,completion_rule_json,content_json,review_status,publication_status,
               created_by,created_at)
           VALUES(?,1,?,?,?,?,?,?,?,?,?,'pending','draft',?,?) RETURNING id""",
        (
            exercise_id, payload["title"], payload["mechanic"], payload["language"], payload["objective"],
            payload["instruction"], payload["response_mode"],
            json.dumps(payload["prompt_policy"], ensure_ascii=False),
            json.dumps(payload["completion_rule"], ensure_ascii=False),
            json.dumps(payload["content"], ensure_ascii=False), created_by, now_iso(),
        ),
    )
    version_id = cursor.fetchone()["id"]
    for position, stimulus in enumerate(payload["content"].get("stimuli", [])):
        db.execute(
            """INSERT INTO exercise_stimuli(version_id,stimulus_key,kind,label,speech,media_ref,position,metadata_json)
               VALUES(?,?,?,?,?,?,?,?)""",
            (
                version_id, stimulus["key"], "image", stimulus["label"], stimulus["speech"],
                stimulus.get("media_ref"), position,
                json.dumps({"hint": stimulus.get("hint", ""), "visual_token": stimulus.get("visual_token")}, ensure_ascii=False),
            ),
        )
    return get_version(db, version_id)


def get_version(db, version_id: int) -> dict:
    row = db.execute(
        """SELECT v.*,e.module,e.skill,e.difficulty,e.target,e.icon,e.is_active
           FROM exercise_versions v JOIN exercises e ON e.id=v.exercise_id WHERE v.id=?""",
        (version_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Версия упражнения не найдена")
    return _decode_version(dict(row))


def preview_version(db, version_id: int) -> dict:
    version = get_version(db, version_id)
    errors = validate_version(version)
    return {
        "version": version,
        "valid": not errors,
        "errors": errors,
        "can_publish": not errors and version["review_status"] == "approved",
        "blocker": "Нужно методическое утверждение" if not errors and version["review_status"] != "approved" else None,
    }


def publish_version(db, version_id: int) -> dict:
    preview = preview_version(db, version_id)
    if preview["errors"]:
        raise HTTPException(422, {"message": "Версия не прошла техническую проверку", "errors": preview["errors"]})
    version = preview["version"]
    if version["review_status"] != "approved":
        raise HTTPException(409, "Публикация заблокирована до методического утверждения")
    db.execute("UPDATE exercise_versions SET publication_status='archived' WHERE exercise_id=? AND publication_status='published'", (version["exercise_id"],))
    db.execute("UPDATE exercise_versions SET publication_status='published',published_at=? WHERE id=?", (now_iso(), version_id))
    db.execute(
        "UPDATE exercises SET title=?,instruction=?,is_active=1 WHERE id=?",
        (version["title"], version["instruction"], version["exercise_id"]),
    )
    return get_version(db, version_id)

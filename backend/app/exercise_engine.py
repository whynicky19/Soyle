import json
import re
import secrets
from typing import Any

from fastapi import HTTPException

from .database import IS_PRODUCTION, env_enabled, now_iso
from .varied_validation import VARIED_MECHANICS, validate_varied


SUPPORTED_PUBLIC_MECHANICS = frozenset({"auditory_choice", "action_choice", "tap_instruction", "guided_aac"}) | VARIED_MECHANICS
# An explicit local demonstration is the only exception to the review gate.
# Production must never accept this environment switch.
ALLOW_UNREVIEWED_DEMO_CONTENT = not IS_PRODUCTION and env_enabled("SOYLE_ALLOW_UNREVIEWED_DEMO_CONTENT")

SENSORY_CONTENT: dict[str, list[dict[str, str]]] = {
    "animals": [
        {"key": "cat", "label": "Кот", "speech": "Кот", "hint": "Домашнее животное, которое мяукает", "media_ref": "/app-illustrations/exercise-stimulus-cat.webp"},
        {"key": "dog", "label": "Собака", "speech": "Собака", "hint": "Домашнее животное, которое лает", "media_ref": "/app-illustrations/exercise-stimulus-dog.webp"},
        {"key": "fish", "label": "Рыба", "speech": "Рыба", "hint": "Она живёт в воде", "media_ref": "/app-illustrations/exercise-stimulus-fish.webp"},
        {"key": "bird", "label": "Птица", "speech": "Птица", "hint": "У неё есть крылья", "media_ref": "/app-illustrations/exercise-stimulus-bird.webp"},
        {"key": "rabbit", "label": "Кролик", "speech": "Кролик", "hint": "У него длинные уши", "media_ref": "/app-illustrations/exercise-stimulus-rabbit.webp"},
        {"key": "turtle", "label": "Черепаха", "speech": "Черепаха", "hint": "У неё есть панцирь", "media_ref": "/app-illustrations/exercise-stimulus-turtle.webp"},
        {"key": "snail", "label": "Улитка", "speech": "Улитка", "hint": "Она носит домик на спине", "media_ref": "/app-illustrations/exercise-stimulus-snail.webp"},
        {"key": "bug", "label": "Жук", "speech": "Жук", "hint": "Маленькое насекомое", "media_ref": "/app-illustrations/exercise-stimulus-bug.webp"},
    ],
    "food": [
        {"key": "apple", "label": "Яблоко", "speech": "Яблоко", "hint": "Фрукт круглой формы", "media_ref": "/app-illustrations/exercise-stimulus-apple.webp"},
        {"key": "banana", "label": "Банан", "speech": "Банан", "hint": "Длинный жёлтый фрукт", "media_ref": "/app-illustrations/exercise-stimulus-banana.webp"},
        {"key": "milk", "label": "Молоко", "speech": "Молоко", "hint": "Белый напиток", "media_ref": "/app-illustrations/exercise-stimulus-milk.webp"},
        {"key": "juice", "label": "Сок", "speech": "Сок", "hint": "Фруктовый напиток", "media_ref": "/app-illustrations/exercise-stimulus-juice.webp"},
        {"key": "water", "label": "Вода", "speech": "Вода", "hint": "Прозрачный напиток", "media_ref": "/app-illustrations/exercise-stimulus-water.webp"},
        {"key": "soup", "label": "Суп", "speech": "Суп", "hint": "Его едят ложкой", "media_ref": "/app-illustrations/exercise-stimulus-soup.webp"},
        {"key": "bread", "label": "Хлеб", "speech": "Хлеб", "hint": "Его нарезают кусочками", "media_ref": "/app-illustrations/exercise-stimulus-bread.webp"},
        {"key": "porridge", "label": "Каша", "speech": "Каша", "hint": "Её едят из тарелки", "media_ref": "/app-illustrations/exercise-stimulus-porridge.webp"},
    ],
    "toys": [
        {"key": "ball", "label": "Мяч", "speech": "Мяч", "hint": "Круглая игрушка", "media_ref": "/app-illustrations/exercise-stimulus-ball.webp"},
        {"key": "toy-car", "label": "Машинка", "speech": "Машинка", "hint": "Игрушка на колёсах", "media_ref": "/app-illustrations/exercise-stimulus-toy-car.webp"},
        {"key": "blocks", "label": "Кубики", "speech": "Кубики", "hint": "Из них можно строить", "media_ref": "/app-illustrations/exercise-stimulus-blocks.webp"},
        {"key": "doll", "label": "Кукла", "speech": "Кукла", "hint": "Игрушка в виде человека", "media_ref": "/app-illustrations/exercise-stimulus-doll.webp"},
        {"key": "book", "label": "Книга", "speech": "Книга", "hint": "В ней рассматривают картинки и читают", "media_ref": "/app-illustrations/exercise-stimulus-book.webp"},
        {"key": "puzzle", "label": "Пазл", "speech": "Пазл", "hint": "Картинка из частей", "media_ref": "/app-illustrations/exercise-stimulus-puzzle.webp"},
        {"key": "paint", "label": "Краски", "speech": "Краски", "hint": "Ими рисуют", "media_ref": "/app-illustrations/exercise-stimulus-paint.webp"},
        {"key": "drum", "label": "Барабан", "speech": "Барабан", "hint": "Игрушечный музыкальный инструмент", "media_ref": "/app-illustrations/exercise-stimulus-drum.webp"},
    ],
}


def _single_card_sequences(labels: list[str]) -> list[list[str]]:
    return [[label] for label in labels]


def _optional_prefix_sequences(prefixes: list[list[str]], labels: list[str]) -> list[list[str]]:
    return _single_card_sequences(labels) + [[*prefix, label] for prefix in prefixes for label in labels]

AAC_SCENARIOS: dict[str, dict[str, Any]] = {
    "request": {
        "title": "Попроси один предмет",
        "instruction": "Выбери, что ты хочешь попросить.",
        "steps": ["Выбери сок, воду, мяч или книгу. Можно сначала добавить «Хочу».", "Нажми «Сказать просьбу»."],
        "criterion": "Задание завершится только после понятной просьбы.",
        "empty_hint": "Сначала выбери сок, воду, мяч или книгу.",
        "incomplete_hint": "«Хочу» — это начало. Теперь выбери предмет.",
        "success_hint": "Просьба готова. Нажми «Сказать просьбу».",
        "action_label": "Сказать просьбу",
        "labels": ["Хочу", "Сок", "Вода", "Мяч", "Книга"],
        "completion": {"type": "contains_any", "accepted_labels": ["Сок", "Вода", "Мяч", "Книга"]},
        "accepted_sequences": _optional_prefix_sequences([["Хочу"]], ["Сок", "Вода", "Мяч", "Книга"]),
    },
    "choice": {
        "title": "Выбери напиток",
        "instruction": "Что ты выбираешь: сок или воду?",
        "steps": ["Выбери одну карточку: «Сок» или «Вода».", "Нажми «Сказать выбор»."],
        "criterion": "Оба ответа подходят — важно сделать понятный выбор.",
        "empty_hint": "Выбери сок или воду.",
        "success_hint": "Выбор готов. Нажми «Сказать выбор».",
        "action_label": "Сказать выбор",
        "labels": ["Сок", "Вода"],
        "completion": {"type": "contains_any", "accepted_labels": ["Сок", "Вода"]},
        "accepted_sequences": _single_card_sequences(["Сок", "Вода"]),
    },
    "refusal": {
        "title": "Скажи, что не хочешь",
        "instruction": "Можно выбрать «Нет», «Стоп» или «Не хочу».",
        "steps": ["Выбери подходящую карточку отказа.", "Нажми «Сказать отказ»."],
        "criterion": "Любой понятный отказ принимается сразу и не считается ошибкой.",
        "empty_hint": "Выбери «Нет», «Стоп» или «Не хочу».",
        "success_hint": "Сообщение готово. Нажми «Сказать отказ».",
        "action_label": "Сказать отказ",
        "labels": ["Нет", "Стоп", "Не хочу"],
        "completion": {"type": "contains_any", "accepted_labels": ["Нет", "Стоп", "Не хочу"]},
        "accepted_sequences": _single_card_sequences(["Нет", "Стоп", "Не хочу"]),
    },
    "feelings": {
        "title": "Сообщи о своём состоянии",
        "instruction": "Выбери карточку, которая подходит сейчас.",
        "steps": ["Выбери одну карточку состояния.", "Нажми «Сообщить состояние»."],
        "criterion": "Здесь нет неправильного чувства — фиксируется само сообщение.",
        "empty_hint": "Выбери карточку состояния.",
        "success_hint": "Сообщение готово. Нажми «Сообщить состояние».",
        "action_label": "Сообщить состояние",
        "labels": ["Больно", "Устал", "Весело", "Грустно", "Спокойно", "Злюсь", "Страшно"],
        "completion": {"type": "contains_any", "accepted_labels": ["Больно", "Устал", "Весело", "Грустно", "Спокойно", "Злюсь", "Страшно"]},
        "accepted_sequences": _single_card_sequences(["Больно", "Устал", "Весело", "Грустно", "Спокойно", "Злюсь", "Страшно"]),
    },
    "help": {
        "title": "Попроси помощь",
        "instruction": "Выбери карточку «Помоги».",
        "steps": ["Выбери «Помоги».", "Нажми «Попросить помощь»."],
        "criterion": "Одной карточки «Помоги» достаточно.",
        "empty_hint": "Выбери карточку «Помоги».",
        "success_hint": "Просьба готова. Нажми «Попросить помощь».",
        "action_label": "Попросить помощь",
        "labels": ["Помоги"],
        "completion": {"type": "contains_any", "accepted_labels": ["Помоги"]},
        "accepted_sequences": [["Помоги"]],
    },
    "answer": {
        "title": "Ответь на вопрос",
        "instruction": "Хочешь продолжить? Ответь «Да» или «Нет».",
        "steps": ["Выбери «Да» или «Нет».", "Нажми «Сказать ответ»."],
        "criterion": "Оценивается факт понятного ответа, а не выбранный вариант.",
        "empty_hint": "Выбери «Да» или «Нет».",
        "success_hint": "Ответ готов. Нажми «Сказать ответ».",
        "action_label": "Сказать ответ",
        "labels": ["Да", "Нет"],
        "completion": {"type": "contains_any", "accepted_labels": ["Да", "Нет"]},
        "accepted_sequences": _single_card_sequences(["Да", "Нет"]),
    },
    "observation": {
        "title": "Покажи, кого ты видишь",
        "instruction": "Выбери маму, папу или кота. Можно сначала добавить «Вижу» или «Я» + «Вижу».",
        "steps": ["Выбери готовую карточку или собери «Я» + «Вижу» + кого ты видишь.", "Нажми «Сказать, кого вижу»."],
        "criterion": "Карточка человека или предмета уже считается понятным сообщением.",
        "empty_hint": "Сначала выбери маму, папу или кота.",
        "incomplete_hint": "Теперь выбери, кого ты видишь.",
        "success_hint": "Сообщение готово. Нажми «Сказать, кого вижу».",
        "action_label": "Сказать, кого вижу",
        "labels": ["Я", "Вижу", "Мама", "Папа", "Кот"],
        "completion": {"type": "contains_any", "accepted_labels": ["Мама", "Папа", "Кот"]},
        "accepted_sequences": _optional_prefix_sequences([["Вижу"], ["Я", "Вижу"]], ["Мама", "Папа", "Кот"]),
    },
    "past_event": {
        "title": "Расскажи, что было",
        "instruction": "Выбери знакомое прошедшее действие. Можно сначала добавить «Я».",
        "steps": ["Выбери «Играл» или «Гулял». При желании сначала добавь «Я».", "Нажми «Рассказать»."],
        "criterion": "Не проверяем, было ли событие на самом деле — важно понятное сообщение.",
        "empty_hint": "Выбери «Играл» или «Гулял».",
        "incomplete_hint": "Добавь действие: «Играл» или «Гулял».",
        "success_hint": "Сообщение готово. Нажми «Рассказать».",
        "action_label": "Рассказать",
        "labels": ["Я", "Играл", "Гулял"],
        "completion": {"type": "contains_any", "accepted_labels": ["Играл", "Гулял"]},
        "accepted_sequences": _optional_prefix_sequences([["Я"]], ["Играл", "Гулял"]),
    },
    "question": {
        "title": "Задай вопрос",
        "instruction": "Выбери готовый вопрос.",
        "steps": ["Выбери «Что это?» или «Где?».", "Нажми «Задать вопрос»."],
        "criterion": "Одна вопросительная карточка завершает задание.",
        "empty_hint": "Выбери один вопрос.",
        "success_hint": "Вопрос готов. Нажми «Задать вопрос».",
        "action_label": "Задать вопрос",
        "labels": ["Что это?", "Где?"],
        "completion": {"type": "contains_any", "accepted_labels": ["Что это?", "Где?"]},
        "accepted_sequences": _single_card_sequences(["Что это?", "Где?"]),
    },
    "routine": {
        "title": "Расскажи об одном действии",
        "instruction": "Выбери знакомое действие дня.",
        "steps": ["Выбери одно действие.", "Нажми «Рассказать о действии»."],
        "criterion": "Одна карточка действия уже является понятным сообщением.",
        "empty_hint": "Выбери одно действие дня.",
        "success_hint": "Сообщение готово. Нажми «Рассказать о действии».",
        "action_label": "Рассказать о действии",
        "labels": ["Есть", "Пить", "Играю", "Гулять", "Читать", "Спать"],
        "completion": {"type": "contains_any", "accepted_labels": ["Есть", "Пить", "Играю", "Гулять", "Читать", "Спать"]},
        "accepted_sequences": _single_card_sequences(["Есть", "Пить", "Играю", "Гулять", "Читать", "Спать"]),
    },
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
            "content": {"scenario_key": target, **scenario, "title": scenario.get("title", exercise["title"])},
        }
    return {
        "mechanic": "local_face_mirror",
        "objective": "Внутренняя прототипная проверка движения перед зеркалом",
        "response_mode": "local_camera_signal",
        "prompt_policy": {"time_limit_seconds": 10},
        "completion_rule": {"success": "local_movement_signal"},
        "content": {"movement": target},
    }


def validate_version(version: dict, *, enforce_visual_consistency: bool = True) -> list[str]:
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

    if "method_card" in version:
        method_card = version.get("method_card")
        required_method_fields = (
            "target_skill",
            "skill_group",
            "intended_for",
            "prerequisites",
            "stimuli_and_responses",
            "child_instruction",
            "adult_guidance",
            "accepted_responses",
            "difficulty_levels",
            "prompts",
            "ambiguities",
            "stop_conditions",
            "result_registration",
            "real_life_transfer",
            "sources",
            "evidence_note",
            "methodology_review_status",
        )
        if not isinstance(method_card, dict):
            errors.append("Методическая карточка имеет неверный формат")
        else:
            for field in required_method_fields:
                value = method_card.get(field)
                if field == "sources":
                    if not isinstance(value, list):
                        errors.append("Методическая карточка: источники должны быть списком")
                    continue
                if not value:
                    errors.append(f"Методическая карточка: не заполнено поле {field}")

    content = version.get("content") if isinstance(version.get("content"), dict) else {}
    choices = content.get("round_choices")
    if choices is not None and (not isinstance(choices, list) or any(type(value) is not int or not 1 <= value <= 60 for value in choices)):
        errors.append("Длина серии должна быть числом от 1 до 60")
    if content.get("default_rounds") is not None and choices and content["default_rounds"] not in choices:
        errors.append("Длина серии по умолчанию должна входить в доступные варианты")
    if mechanic in {"auditory_choice", "action_choice"}:
        stimuli = content.get("stimuli") if isinstance(content, dict) else None
        if not isinstance(stimuli, list) or not 4 <= len(stimuli) <= 64:
            errors.append("Для выбора на слух нужны от 4 до 64 стимулов, чтобы поддержать четыре варианта")
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
                exemplars = stimulus.get("exemplars")
                if exemplars is not None:
                    if not isinstance(exemplars, list) or not 1 <= len(exemplars) <= 5 or any(
                        not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or ".." in path.split("/")
                        for path in exemplars
                    ):
                        errors.append(f"Стимул {index}: примеры должны содержать от 1 до 5 локальных путей")
                    elif len(set([stimulus.get("media_ref"), *exemplars])) != len(exemplars) + 1:
                        errors.append(f"Стимул {index}: примеры должны отличаться от основного изображения и друг от друга")
                if mechanic == "action_choice" and not stimulus.get("media_ref"):
                    errors.append(f"Стимул {index}: для действия нужна полноценная локальная сцена, а не visual_token")
                keys.append(key.lower())
                labels.append(label.casefold())
            if len(keys) != len(set(keys)):
                errors.append("Ключи стимулов не должны повторяться")
            if len(labels) != len(set(labels)):
                errors.append("Подписи стимулов не должны повторяться")
            visual_systems = {
                "illustration" if stimulus.get("media_ref") else "token"
                for stimulus in stimuli
                if isinstance(stimulus, dict) and (stimulus.get("media_ref") or stimulus.get("visual_token"))
            }
            if enforce_visual_consistency and len(visual_systems) > 1:
                errors.append("Стимулы одного задания нельзя смешивать: используйте единый проверенный набор иллюстраций")
        if version.get("response_mode") != "single_tap":
            errors.append("Механика выбора на слух требует response_mode=single_tap")
        if content.get("exemplar_policy") == "matched_set" and isinstance(stimuli, list):
            counts = {len(item.get("exemplars", [])) for item in stimuli if isinstance(item, dict) and isinstance(item.get("exemplars", []), list)}
            if len(counts) != 1 or not counts or min(counts) < 1:
                errors.append("Для согласованных серий у каждого стимула должно быть одинаковое непустое число примеров")
        if version.get("completion_rule", {}).get("success") != "matching_stimulus_key":
            errors.append("Правильный ответ должен определяться ключом стимула, а не позицией картинки")
        levels = content.get("difficulty_levels")
        if levels is not None:
            option_counts = {
                level.get("option_count") for level in levels if isinstance(level, dict)
            } if isinstance(levels, list) else set()
            if option_counts != {2, 3, 4}:
                errors.append("Настройка сложности должна явно поддерживать 2, 3 и 4 варианта")
            for level in levels if isinstance(levels, list) else []:
                try:
                    max_attempts = int(level.get("max_attempts", 0)) if isinstance(level, dict) else 0
                except (TypeError, ValueError):
                    max_attempts = 0
                if not 1 <= max_attempts <= 4:
                    errors.append("Для каждого уровня нужно от 1 до 4 попыток")
                    break
    elif mechanic == "tap_instruction":
        scenarios = content.get("scenarios") if isinstance(content, dict) else None
        if not isinstance(scenarios, list) or not scenarios:
            errors.append("Для выполнения инструкции нужен непустой список сценариев")
        else:
            scenario_keys: list[str] = []
            for index, scenario in enumerate(scenarios, start=1):
                if not isinstance(scenario, dict):
                    errors.append(f"Сценарий {index} имеет неверный формат")
                    continue
                key = str(scenario.get("key") or "").strip()
                instruction = str(scenario.get("instruction") or "").strip()
                speech = str(scenario.get("speech") or "").strip()
                objects = scenario.get("objects")
                success = scenario.get("success")
                if not key or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,49}", key):
                    errors.append(f"Сценарий {index}: нужен стабильный латинский key")
                if not instruction or not speech:
                    errors.append(f"Сценарий {index}: нужны инструкция и озвучиваемый текст")
                if not isinstance(objects, list) or len(objects) < 2:
                    errors.append(f"Сценарий {index}: нужны отдельные предмет и цель")
                    continue
                object_keys = {str(item.get("key") or "") for item in objects if isinstance(item, dict)}
                movable = {str(item.get("key") or "") for item in objects if isinstance(item, dict) and item.get("role") == "movable"}
                targets = {str(item.get("key") or "") for item in objects if isinstance(item, dict) and item.get("role") == "target"}
                if not isinstance(success, dict) or success.get("object_key") not in movable or success.get("target_key") not in targets:
                    errors.append(f"Сценарий {index}: правило завершения должно связывать movable-предмет и target")
                for item in objects:
                    if not isinstance(item, dict) or not item.get("label") or not str(item.get("media_ref") or "").startswith("/"):
                        errors.append(f"Сценарий {index}: каждый объект требует подпись и локальную иллюстрацию")
                        break
                if len(object_keys) != len(objects):
                    errors.append(f"Сценарий {index}: ключи объектов должны быть уникальны")
                result = scenario.get("result")
                if result is not None and (not isinstance(result, dict)
                    or result.get("relation") not in {"give", "in", "on"}
                    or not str(result.get("speech") or "").strip()):
                    errors.append(f"Сценарий {index}: результат требует действие give/in/on и текст озвучивания")
                if isinstance(result, dict) and isinstance(success, dict):
                    expected_target = {"in": "box", "on": "table"}.get(result.get("relation"))
                    if expected_target and not result.get("media_ref") and success.get("target_key") != expected_target:
                        errors.append(f"Сценарий {index}: визуальный результат не соответствует цели действия")
                scenario_keys.append(key)
            if len(scenario_keys) != len(set(scenario_keys)):
                errors.append("Ключи сценариев не должны повторяться")
        if version.get("response_mode") != "tap_sequence":
            errors.append("Механика инструкции требует response_mode=tap_sequence")
        if version.get("completion_rule", {}).get("steps") != 1:
            errors.append("В P1 разрешены только одношаговые инструкции")
    elif mechanic in VARIED_MECHANICS:
        errors.extend(validate_varied(version))
    elif mechanic == "guided_aac":
        if content.get('presentation') == 'picture_description':
            from .observation_content import validate_observation
            errors.extend(validate_observation(content))
            return errors
        labels = content.get("labels") if isinstance(content, dict) else None
        if not isinstance(labels, list) or not labels:
            errors.append("Для guided AAC нужен непустой список допустимых карточек")
        elif len(labels) != len(set(labels)):
            errors.append("В guided AAC допустимые карточки не должны повторяться")
        completion = content.get("completion") if isinstance(content, dict) else None
        accepted_labels = completion.get("accepted_labels") if isinstance(completion, dict) else None
        if not isinstance(accepted_labels, list) or not accepted_labels:
            errors.append("Для guided AAC нужен непустой список принимаемых ответов")
        elif isinstance(labels, list) and (len(accepted_labels) != len(set(accepted_labels)) or not set(accepted_labels).issubset(labels)):
            errors.append("Принимаемые ответы guided AAC должны быть уникальны и входить в допустимые карточки")
        sequences = content.get("accepted_sequences") if isinstance(content, dict) else None
        if sequences is not None:
            if not isinstance(sequences, list) or not sequences or any(not isinstance(sequence, list) or not sequence for sequence in sequences):
                errors.append("Допустимые последовательности guided AAC должны быть непустыми списками")
            else:
                sequence_keys = [tuple(sequence) for sequence in sequences]
                if len(sequence_keys) != len(set(sequence_keys)):
                    errors.append("Последовательности guided AAC не должны повторяться")
                if isinstance(labels, list) and any(len(sequence) != len(set(sequence)) or not set(sequence).issubset(labels) for sequence in sequences):
                    errors.append("Карточки в последовательностях guided AAC должны быть уникальны и допустимы для задания")
                if isinstance(accepted_labels, list) and any(not set(sequence).intersection(accepted_labels) for sequence in sequences):
                    errors.append("Каждая последовательность guided AAC должна содержать принимаемый ответ")
    return errors


def _decode_version(row: dict) -> dict:
    result = dict(row)
    result["prompt_policy"] = json.loads(result.pop("prompt_policy_json") or "{}")
    result["completion_rule"] = json.loads(result.pop("completion_rule_json") or "{}")
    result["content"] = json.loads(result.pop("content_json") or "{}")
    if "method_card_json" in result:
        result["method_card"] = json.loads(result.pop("method_card_json") or "{}")
    return result


def published_exercise_rows(db) -> list[dict]:
    rows = db.execute(
        """SELECT e.*,v.id exercise_version_id,v.version content_version,v.mechanic,v.language,
                  v.title published_title,v.instruction published_instruction,
                  v.objective,v.response_mode,v.prompt_policy_json,v.completion_rule_json,v.content_json,
                  v.review_status,v.publication_status,v.technical_status,v.methodology_status,
                  v.accessibility_status,v.release_status,v.admin_review_status
           FROM exercises e
           JOIN exercise_versions v ON v.exercise_id=e.id
           WHERE e.is_active=1 AND v.review_status='approved' AND v.publication_status='published'
             AND v.mechanic<>'local_face_mirror'
             AND (v.admin_review_status='approved' OR (v.technical_status='passed' AND v.methodology_status='approved'
                   AND v.accessibility_status='approved' AND v.release_status='approved')
                  OR ?=1)
             AND v.version=(SELECT MAX(v2.version) FROM exercise_versions v2
                            WHERE v2.exercise_id=e.id AND v2.review_status='approved'
                              AND v2.publication_status='published')
           ORDER BY e.module,e.difficulty,e.id""",
        (int(ALLOW_UNREVIEWED_DEMO_CONTENT),),
    ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item['title'] = item.pop('published_title')
        item['instruction'] = item.pop('published_instruction')
        mechanic = item.pop("mechanic")
        content = json.loads(item.pop("content_json") or "{}")
        item["engine"] = {
            "version_id": item.pop("exercise_version_id"),
            "version": item.pop("content_version"),
            "mechanic": mechanic,
            "language": item.pop("language"),
            "objective": item.pop("objective"),
            "response_mode": item.pop("response_mode"),
            "prompt_policy": json.loads(item.pop("prompt_policy_json") or "{}"),
            "completion_rule": json.loads(item.pop("completion_rule_json") or "{}"),
            "content": content,
            "review_status": item.pop("review_status"),
            "publication_status": item.pop("publication_status"),
            "review_gate": {
                "approved": item.get("admin_review_status") == "approved" or all((
                    item.get("technical_status") == "passed",
                    item.get("methodology_status") == "approved",
                    item.get("accessibility_status") == "approved",
                    item.get("release_status") == "approved",
                )),
                "demo_only": item.get("admin_review_status") != "approved" and not all((
                    item.get("technical_status") == "passed",
                    item.get("methodology_status") == "approved",
                    item.get("accessibility_status") == "approved",
                    item.get("release_status") == "approved",
                )),
                "admin_review_status": item.pop("admin_review_status"),
                "technical_status": item.pop("technical_status"),
                "methodology_status": item.pop("methodology_status"),
                "accessibility_status": item.pop("accessibility_status"),
                "release_status": item.pop("release_status"),
            },
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
               technical_status,methodology_status,release_status,method_card_json,created_by,created_at)
           VALUES(?,1,?,?,?,?,?,?,?,?,?,'pending','draft','pending','pending','pending',?,?,?) RETURNING id""",
        (
            exercise_id, payload["title"], payload["mechanic"], payload["language"], payload["objective"],
            payload["instruction"], payload["response_mode"],
            json.dumps(payload["prompt_policy"], ensure_ascii=False),
            json.dumps(payload["completion_rule"], ensure_ascii=False),
            json.dumps(payload["content"], ensure_ascii=False),
            json.dumps(payload.get("method_card") or {}, ensure_ascii=False), created_by, now_iso(),
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


def needs_admin_confirmation(version: dict) -> bool:
    """A legacy publication is hidden until an administrator confirms it."""
    return (version["publication_status"] == "published"
            and version.get("admin_review_status") != "approved"
            and not (version.get("technical_status") == "passed"
                     and all(version.get(field) == "approved" for field in
                             ("methodology_status", "accessibility_status", "release_status"))))


def preview_version(db, version_id: int) -> dict:
    version = get_version(db, version_id)
    errors = validate_version(version)
    return {
        "version": version,
        "valid": not errors,
        "errors": errors,
        "can_publish": not errors and (version["publication_status"] == "draft" or needs_admin_confirmation(version)),
        "blocker": "Исправьте замечания перед публикацией" if errors else None,
    }


def publish_version(db, version_id: int, reviewer_id: int | None = None, comment: str = "") -> dict:
    preview = preview_version(db, version_id)
    version = preview["version"]
    confirming_legacy = needs_admin_confirmation(version)
    if version["publication_status"] not in {"draft", "archived"} and not confirming_legacy:
        raise HTTPException(409, "Эта версия уже опубликована")
    if confirming_legacy and reviewer_id is None:
        raise HTTPException(409, "Нужно решение администратора")
    if preview["errors"]:
        raise HTTPException(422, {"message": "Исправьте ошибки задания", "errors": preview["errors"]})
    if reviewer_id is not None:
        # One explicit administrator decision, without fabricating expert approvals.
        actor = db.execute("SELECT role,is_active FROM users WHERE id=?", (reviewer_id,)).fetchone()
        if not actor or actor["role"] != "admin" or not actor["is_active"]:
            raise HTTPException(403, "Публиковать задания может только администратор")
        db.execute("UPDATE exercise_versions SET admin_review_status='approved',review_status='approved' WHERE id=?", (version_id,))
        db.execute("""INSERT INTO content_reviews(version_id,stage,decision,comment,reviewer_id,created_at)
            VALUES(?,'admin','approved',?,?,?)""", (version_id, comment.strip() or "Администратор проверил задание и опубликовал", reviewer_id, now_iso()))
    elif version["review_status"] != "approved":
        raise HTTPException(409, "Нужно решение администратора")
    if not confirming_legacy:
        db.execute("UPDATE exercise_versions SET publication_status='archived' WHERE exercise_id=? AND publication_status='published'", (version["exercise_id"],))
        db.execute("UPDATE exercise_versions SET publication_status='published',published_at=? WHERE id=?", (now_iso(), version_id))
    db.execute("UPDATE exercises SET title=?,instruction=?,is_active=1 WHERE id=?", (version["title"], version["instruction"], version["exercise_id"]))
    return get_version(db, version_id)


def review_capabilities(db, user_id: int) -> dict[str, bool]:
    return {"admin_review": True}


def review_workspace(db, version_id: int, user_id: int) -> dict:
    preview = preview_version(db, version_id)
    version = preview["version"]
    review_rows = db.execute(
        """SELECT r.*,COALESCE(u.full_name,'Системная проверка') reviewer_name
           FROM content_reviews r LEFT JOIN users u ON u.id=r.reviewer_id
           WHERE r.version_id=? ORDER BY r.created_at,r.id""",
        (version_id,),
    ).fetchall()
    stimulus_rows = db.execute(
        "SELECT * FROM exercise_stimuli WHERE version_id=? ORDER BY position,id",
        (version_id,),
    ).fetchall()
    stimuli = []
    for row in stimulus_rows:
        item = dict(row)
        item["metadata"] = json.loads(item.pop("metadata_json") or "{}")
        stimuli.append(item)
    history_rows = db.execute(
        """SELECT id,version,title,review_status,publication_status,technical_status,
                  methodology_status,accessibility_status,release_status,created_at,published_at
           FROM exercise_versions WHERE exercise_id=? ORDER BY version DESC,id DESC""",
        (version["exercise_id"],),
    ).fetchall()
    return {
        **preview,
        "stimuli_index": stimuli,
        "reviews": [dict(row) for row in review_rows],
        "version_history": [dict(row) for row in history_rows],
        "capabilities": review_capabilities(db, user_id),
    }


def submit_content_review(
    db,
    version_id: int,
    reviewer_id: int,
    stage: str,
    decision: str,
    comment: str,
) -> dict:
    preview = preview_version(db, version_id)
    version = preview["version"]
    legacy = needs_admin_confirmation(version)
    if version["publication_status"] != "draft" and not legacy:
        raise HTTPException(409, "Проверять можно только черновую версию")
    if stage != "admin" or decision != "changes_requested":
        raise HTTPException(422, "Используйте единое решение администратора: опубликовать или вернуть на доработку")
    if legacy:
        db.execute("UPDATE exercise_versions SET publication_status='draft' WHERE id=?", (version_id,))
        db.execute("UPDATE exercises SET is_active=0 WHERE id=?", (version["exercise_id"],))
    db.execute("UPDATE exercise_versions SET admin_review_status='changes_requested',review_status='changes_requested' WHERE id=?", (version_id,))
    db.execute("""INSERT INTO content_reviews(version_id,stage,decision,comment,reviewer_id,created_at)
        VALUES(?,?,?,?,?,?)""", (version_id, stage, decision, comment.strip(), reviewer_id, now_iso()))
    return review_workspace(db, version_id, reviewer_id)

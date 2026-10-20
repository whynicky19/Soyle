"""Synthetic P1 fixtures and stable non-diagnostic observation vocabularies.

The exercise and home-practice fixtures in this module are review material.  A
migration stores them as DRAFT/pending; importing this module never publishes
content or makes it available to a child.
"""

from typing import Any


SKILL_CATEGORIES = (
    ("object_comprehension", "Понимание предметов"),
    ("action_comprehension", "Понимание действий"),
    ("instruction_comprehension", "Понимание инструкций"),
    ("aac_use", "Использование AAC"),
    ("request_expression", "Выражение просьб"),
    ("response_independence", "Самостоятельность ответа"),
    ("prompt_use", "Использование подсказок"),
)

OBSERVATION_STATUSES = (
    "not_observed",
    "not_yet",
    "with_help",
    "independent",
    "needs_review",
)

HOME_OBSERVATION_OUTCOMES = (
    "not_observed",
    "independent",
    "with_help",
    "refused",
    "stopped",
)


WORD_RUNNER_DRAFT: dict[str, Any] = {
    "target": "p1-word-runner-demo",
    "module": "sensory",
    "title": "Понимание слов — настройка runner",
    "instruction": "Послушай слово и покажи картинку",
    "difficulty": 1,
    "skill": "vocabulary",
    "icon": "/aac-pictograms/ball.png",
    "mechanic": "auditory_choice",
    "objective": "Сопоставить услышанное слово со знакомым изображением",
    "response_mode": "single_tap",
    "prompt_policy": {
        "steps": ["repeat_audio", "visual_hint", "reduced_choice", "model_answer"],
        "time_limit": None,
        "max_attempts": 3,
    },
    "completion_rule": {"rounds": 5, "success": "matching_stimulus_key"},
    "content": {
        "difficulty_levels": [
            {"level": 1, "option_count": 2, "rounds": 4, "max_attempts": 3},
            {"level": 2, "option_count": 3, "rounds": 5, "max_attempts": 3},
            {"level": 3, "option_count": 4, "rounds": 5, "max_attempts": 3},
        ],
        "stimuli": [
            {"key": "ball", "label": "Мяч", "speech": "Мяч", "hint": "Круглый предмет для игры", "media_ref": "/aac-pictograms/ball.png"},
            {"key": "toy-car", "label": "Машинка", "speech": "Машинка", "hint": "Игрушка на колёсах", "media_ref": "/aac-pictograms/toy-car.png"},
            {"key": "doll", "label": "Кукла", "speech": "Кукла", "hint": "Игрушка в виде человека", "media_ref": "/aac-pictograms/doll.png"},
            {"key": "book", "label": "Книга", "speech": "Книга", "hint": "В ней читают и смотрят картинки", "media_ref": "/aac-pictograms/book.png"},
            {"key": "puzzle", "label": "Пазл", "speech": "Пазл", "hint": "Картинка из частей", "media_ref": "/aac-pictograms/puzzle.png"},
            {"key": "apple", "label": "Яблоко", "speech": "Яблоко", "hint": "Круглый фрукт", "media_ref": "/aac-pictograms/apple.png"},
        ],
    },
}


ACTION_RUNNER_DRAFT: dict[str, Any] = {
    "target": "actions",
    "module": "sensory",
    "title": "Понимание действий — демонстрационный набор",
    "instruction": "Послушай вопрос и покажи, кто выполняет действие",
    "difficulty": 2,
    "skill": "speech_comprehension",
    "icon": "/p1/actions/run.svg",
    "mechanic": "action_choice",
    "objective": "Сопоставить услышанное действие с однозначной сценой",
    "response_mode": "single_tap",
    "prompt_policy": {
        "steps": ["repeat_audio", "visual_hint", "reduced_choice", "model_answer"],
        "time_limit": None,
        "max_attempts": 3,
    },
    "completion_rule": {"rounds": 5, "success": "matching_stimulus_key"},
    "content": {
        "difficulty_levels": [
            {"level": 1, "option_count": 2, "rounds": 4, "max_attempts": 3},
            {"level": 2, "option_count": 3, "rounds": 5, "max_attempts": 3},
            {"level": 3, "option_count": 4, "rounds": 5, "max_attempts": 3},
        ],
        "stimuli": [
            {"key": "sleep", "label": "Спит", "speech": "Кто спит?", "hint": "Посмотри, кто лежит с закрытыми глазами", "media_ref": "/p1/actions/sleep.svg"},
            {"key": "eat", "label": "Ест", "speech": "Кто ест?", "hint": "Посмотри, у кого еда и ложка", "media_ref": "/p1/actions/eat.svg"},
            {"key": "drink", "label": "Пьёт", "speech": "Кто пьёт?", "hint": "Посмотри, кто держит чашку у рта", "media_ref": "/p1/actions/drink.svg"},
            {"key": "play", "label": "Играет", "speech": "Кто играет?", "hint": "Посмотри, кто играет с мячом", "media_ref": "/p1/actions/play.svg"},
            {"key": "run", "label": "Бежит", "speech": "Кто бежит?", "hint": "Посмотри на ноги и линии движения", "media_ref": "/p1/actions/run.svg"},
        ],
    },
}


INSTRUCTION_RUNNER_DRAFT: dict[str, Any] = {
    "target": "p1-simple-instructions-demo",
    "module": "sensory",
    "title": "Простые инструкции — демонстрационный набор",
    "instruction": "Послушай и выполни одно действие на экране",
    "difficulty": 1,
    "skill": "speech_comprehension",
    "icon": "/p1/objects/box.svg",
    "mechanic": "tap_instruction",
    "objective": "Выполнить одношаговую инструкцию последовательными нажатиями на предмет и цель",
    "response_mode": "tap_sequence",
    "prompt_policy": {
        "steps": ["repeat_audio", "highlight_movable", "highlight_target", "model_answer"],
        "time_limit": None,
        "max_attempts": 3,
    },
    "completion_rule": {"success": "matching_object_and_target", "steps": 1},
    "content": {
        "scenarios": [
            {
                "key": "give-ball",
                "instruction": "Дай мяч",
                "speech": "Дай мяч",
                "objects": [
                    {"key": "ball", "label": "Мяч", "role": "movable", "media_ref": "/aac-pictograms/ball.png"},
                    {"key": "book", "label": "Книга", "role": "movable", "media_ref": "/aac-pictograms/book.png"},
                    {"key": "adult", "label": "Взрослый", "role": "target", "media_ref": "/p1/objects/adult.svg"},
                    {"key": "box", "label": "Коробка", "role": "target", "media_ref": "/p1/objects/box.svg"},
                ],
                "success": {"object_key": "ball", "target_key": "adult"},
            },
            {
                "key": "put-ball-in-box",
                "instruction": "Положи мяч в коробку",
                "speech": "Положи мяч в коробку",
                "objects": [
                    {"key": "ball", "label": "Мяч", "role": "movable", "media_ref": "/aac-pictograms/ball.png"},
                    {"key": "doll", "label": "Кукла", "role": "movable", "media_ref": "/aac-pictograms/doll.png"},
                    {"key": "box", "label": "Коробка", "role": "target", "media_ref": "/p1/objects/box.svg"},
                    {"key": "adult", "label": "Взрослый", "role": "target", "media_ref": "/p1/objects/adult.svg"},
                ],
                "success": {"object_key": "ball", "target_key": "box"},
            },
            {
                "key": "give-bear-apple",
                "instruction": "Дай мишке яблоко",
                "speech": "Дай мишке яблоко",
                "objects": [
                    {"key": "apple", "label": "Яблоко", "role": "movable", "media_ref": "/aac-pictograms/apple.png"},
                    {"key": "banana", "label": "Банан", "role": "movable", "media_ref": "/aac-pictograms/banana.png"},
                    {"key": "bear", "label": "Мишка", "role": "target", "media_ref": "/p1/objects/bear.svg"},
                    {"key": "adult", "label": "Взрослый", "role": "target", "media_ref": "/p1/objects/adult.svg"},
                ],
                "success": {"object_key": "apple", "target_key": "bear"},
            },
        ],
    },
}


HOME_ACTIVITY_DRAFTS: tuple[dict[str, Any], ...] = (
    {
        "key": "find-home-item",
        "title": "Найди предмет дома",
        "objective": "Понять название знакомого предмета в обычной ситуации",
        "materials": ["Два знакомых безопасных предмета"],
        "adult_instructions": ["Положите предметы рядом", "Назовите один предмет один раз", "Спокойно подождите не меньше пяти секунд"],
        "accepted_responses": ["Ребёнок показывает предмет", "Берёт предмет", "Смотрит на предмет или обозначает его AAC-карточкой"],
        "prompts": ["Повторите слово", "Покажите область, где лежат предметы", "Оставьте один предмет и покажите действие вместе"],
        "stop_conditions": ["Отказ или «не хочу»", "Просьба о перерыве", "Усталость или заметный дискомфорт"],
    },
    {
        "key": "feed-bear",
        "title": "Накорми мишку",
        "objective": "Выполнить одно знакомое действие с предметом",
        "materials": ["Игрушечный мишка", "Игрушечная еда или безопасный знакомый предмет"],
        "adult_instructions": ["Поставьте мишку и еду перед ребёнком", "Скажите: «Накорми мишку»", "Примите действие или понятный альтернативный ответ"],
        "accepted_responses": ["Подносит еду к мишке", "Показывает нужный предмет", "Просит помощи или отказывается"],
        "prompts": ["Повторите инструкцию", "Укажите на еду", "Покажите начало действия без ведения руки"],
        "stop_conditions": ["Отказ", "Перерыв", "Предмет становится небезопасным или вызывает дискомфорт"],
    },
    {
        "key": "tidy-toys",
        "title": "Собери игрушки",
        "objective": "Выполнить одну бытовую инструкцию с понятной целью",
        "materials": ["Одна или две игрушки", "Коробка"],
        "adult_instructions": ["Оставьте на виду одну игрушку и коробку", "Скажите: «Положи игрушку в коробку»", "После одного действия завершите попытку"],
        "accepted_responses": ["Кладёт игрушку в коробку", "Передаёт игрушку взрослому для совместного действия", "Просит помощь"],
        "prompts": ["Повторите инструкцию", "Покажите коробку", "Покажите действие с другой игрушкой"],
        "stop_conditions": ["Отказ или перерыв", "Попытка вызывает раздражение", "Игрушки начинают бросать небезопасно"],
    },
    {
        "key": "ask-for-help",
        "title": "Попроси помощь",
        "objective": "Использовать доступный способ просьбы о помощи",
        "materials": ["Знакомая закрытая коробка или игрушка, которую трудно открыть", "Доступная AAC-карточка «Помоги»"],
        "adult_instructions": ["Создайте безопасную ситуацию, где помощь естественна", "Подождите инициативу", "Сразу ответьте на любой понятный способ просьбы"],
        "accepted_responses": ["Слово или жест", "Взгляд и передача предмета", "AAC-карточка «Помоги»"],
        "prompts": ["Покажите карточку «Помоги»", "Скажите: «Можно попросить помощь»", "Смоделируйте просьбу один раз"],
        "stop_conditions": ["Отказ", "Расстройство", "Взрослый уже понял потребность — не требовать повторения"],
    },
    {
        "key": "show-action",
        "title": "Покажи действие",
        "objective": "Соотнести знакомое действие с реальной ситуацией",
        "materials": ["Два знакомых предмета для разных действий, например чашка и мяч"],
        "adult_instructions": ["Предложите один короткий вопрос о действии", "Дайте ребёнку показать предмет, жест или действие", "Не просите произносить слово"],
        "accepted_responses": ["Показывает или выполняет действие", "Выбирает соответствующий предмет", "Отвечает жестом или AAC"],
        "prompts": ["Повторите вопрос", "Сузьте выбор до двух предметов", "Покажите модель действия"],
        "stop_conditions": ["Отказ или перерыв", "Усталость", "Действие нельзя выполнить безопасно"],
    },
)

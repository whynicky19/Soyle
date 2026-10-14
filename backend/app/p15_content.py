"""Synthetic P1.5 content prepared for independent expert review.

Nothing in this module is clinically approved.  Migration 13 stores every
exercise and home activity as DRAFT/pending and never activates it for a child.
All visual assets referenced here are local project illustrations.
"""

from typing import Any


DIFFICULTY_LEVELS = [
    {"level": 1, "option_count": 2, "rounds": 4, "max_attempts": 3},
    {"level": 2, "option_count": 3, "rounds": 5, "max_attempts": 3},
    {"level": 3, "option_count": 4, "rounds": 6, "max_attempts": 3},
]

PROMPT_STEPS = ["repeat_audio", "visual_hint", "reduced_choice", "model_answer"]


def _asset(path: str) -> dict[str, str]:
    asset_kind = "PNG-пиктограмма" if path.endswith(".png") else "SVG-иллюстрация"
    return {
        "media_ref": path,
        "origin": f"Söyle P1.5 — оригинальная синтетическая {asset_kind}",
        "license": "Внутренний проектный ресурс; сторонние материалы не использованы",
        "license_status": "documented",
    }


def _stimulus(key: str, label: str, hint: str, path: str, *, speech: str | None = None, alt: str | None = None) -> dict[str, str]:
    return {
        "key": key,
        "label": label,
        "speech": speech or label,
        "hint": hint,
        "media_ref": path,
        "alt": alt or f"Изолированное изображение: {label.lower()}",
    }


def _method_card(
    *,
    target_skill: str,
    skill_group: list[str],
    child_instruction: str,
    stimuli_and_responses: str,
    ambiguities: list[str],
    transfer: list[str],
    adult_guidance: list[str] | None = None,
    accepted_responses: list[str] | None = None,
    prerequisites: list[str] | None = None,
    result_rules: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "target_skill": target_skill,
        "skill_group": skill_group,
        "intended_for": ["Дети, которым нужна практика понимания коротких устных инструкций и слов"],
        "diagnosis_boundary": "Группа описана через наблюдаемые навыки, а не диагноз.",
        "prerequisites": prerequisites or [
            "Переносит короткое предъявление двух изображений",
            "Может ответить касанием, указанием или доступным альтернативным способом",
        ],
        "stimuli_and_responses": stimuli_and_responses,
        "child_instruction": child_instruction,
        "adult_guidance": adult_guidance or [
            "Произнесите инструкцию один раз и дайте не меньше пяти секунд",
            "Не требуйте речевого ответа и не направляйте руку ребёнка",
            "Отметьте подсказку только если она действительно использовалась",
        ],
        "accepted_responses": accepted_responses or [
            "Самостоятельное нажатие на нужную карточку",
            "Нажатие после отмеченной подсказки",
            "Отказ, просьба о помощи или перерыве как отдельный допустимый исход",
        ],
        "difficulty_levels": [
            "Уровень 1: два визуально различимых варианта",
            "Уровень 2: три варианта одной тематической группы",
            "Уровень 3: четыре варианта без позиционной подсказки",
        ],
        "prompts": [
            "Повторить аудио без изменения формулировки",
            "Дать нейтральную смысловую подсказку",
            "Сократить выбор до двух вариантов",
            "Показать модель ответа и завершить раунд без наказания",
        ],
        "ambiguities": ambiguities,
        "stop_conditions": [
            "Ребёнок отказывается или выбирает «Не хочу»",
            "Ребёнок просит перерыв или помощь",
            "Появились усталость, расстройство или заметный дискомфорт",
            "Аудио или изображение недоступно — результат фиксируется как техническая ошибка",
        ],
        "result_registration": result_rules or [
            "Хранить стабильный ключ выбранного и целевого стимула",
            "Разделять самостоятельный ответ, ответ с подсказкой, модель, отказ, перерыв и техническую ошибку",
            "Не выводить диагноз, речевой возраст или единый процент развития",
        ],
        "real_life_transfer": transfer,
        "sources": [],
        "evidence_note": "Специальный научный или клинический источник не назначен. Основание — прозрачная практика сопоставления; формулировки, изображения и иерархия подсказок требуют независимой проверки русскоязычным логопедом/методистом.",
        "methodology_review_status": "pending",
    }


NOUN_SETS: tuple[dict[str, Any], ...] = (
    {
        "target": "p15-nouns-toys",
        "title": "Понимание слов: игрушки",
        "difficulty": 1,
        "stimuli": [
            _stimulus("toy-ball", "Мяч", "Круглая игрушка, которую катают или бросают", "/p15/nouns/toys/ball.svg"),
            _stimulus("toy-blocks", "Кубики", "Несколько деталей для постройки", "/p15/nouns/toys/blocks.svg"),
            _stimulus("toy-doll", "Кукла", "Игрушка в виде человека", "/p15/nouns/toys/doll.svg"),
            _stimulus("toy-car", "Машинка", "Игрушка с колёсами", "/p15/nouns/toys/toy-car.svg"),
            _stimulus("toy-puzzle", "Пазл", "Картинка из соединяемых частей", "/p15/nouns/toys/puzzle.svg"),
            _stimulus("toy-drum", "Барабан", "Игрушечный музыкальный инструмент с палочками", "/p15/nouns/toys/drum.svg"),
        ],
        "ambiguities": ["Мяч и круглая деталь пазла могут быть похожи по контуру; проверять на разных позициях", "Кубики показаны группой, а остальные предметы — по одному"],
        "transfer": ["Попросить найти тот же предмет среди двух реальных игрушек", "Назвать предмет во время спокойной совместной игры"],
    },
    {
        "target": "p15-nouns-food",
        "title": "Понимание слов: еда и напитки",
        "difficulty": 1,
        "stimuli": [
            _stimulus("food-apple", "Яблоко", "Круглый фрукт с листиком", "/p15/nouns/food/apple.svg"),
            _stimulus("food-banana", "Банан", "Длинный изогнутый фрукт", "/p15/nouns/food/banana.svg"),
            _stimulus("food-bread", "Хлеб", "Нарезанный батон", "/p15/nouns/food/bread.svg"),
            _stimulus("food-juice", "Сок", "Напиток в прозрачном стакане с трубочкой", "/p15/nouns/food/juice.svg"),
            _stimulus("food-water", "Вода", "Прозрачная вода в стакане", "/p15/nouns/food/water.svg"),
            _stimulus("food-soup", "Суп", "Тарелка с супом и ложкой", "/p15/nouns/food/soup.svg"),
        ],
        "ambiguities": ["Сок и вода показаны в одинаковой посуде; различие не должно зависеть только от цвета", "Еда не должна использоваться как обязательная награда"],
        "transfer": ["Найти названный продукт на столе", "Выбрать один из двух доступных напитков без требования произнести слово"],
    },
    {
        "target": "p15-nouns-animals",
        "title": "Понимание слов: животные",
        "difficulty": 1,
        "stimuli": [
            _stimulus("animal-cat", "Кот", "Домашнее животное с усами и длинным хвостом", "/aac-pictograms/cat.png"),
            _stimulus("animal-dog", "Собака", "Домашнее животное с ошейником", "/aac-pictograms/dog.png"),
            _stimulus("animal-rabbit", "Кролик", "Животное с длинными ушами", "/aac-pictograms/rabbit.png"),
            _stimulus("animal-bird", "Птица", "Животное с крыльями и клювом", "/aac-pictograms/bird.png"),
            _stimulus("animal-fish", "Рыба", "Животное с плавниками", "/aac-pictograms/fish.png"),
            _stimulus("animal-turtle", "Черепаха", "Животное с панцирем", "/aac-pictograms/turtle.png"),
        ],
        "ambiguities": ["Иллюстрации обозначают категорию, а не конкретную породу", "Проверить узнаваемость стилизованных поз и пропорций"],
        "transfer": ["Найти животное в знакомой книге", "Показать названную игрушку-животное"],
    },
    {
        "target": "p15-nouns-clothing",
        "title": "Понимание слов: одежда",
        "difficulty": 1,
        "stimuli": [
            _stimulus("clothes-shirt", "Футболка", "Одежда с короткими рукавами", "/p15/nouns/clothing/shirt.svg"),
            _stimulus("clothes-trousers", "Брюки", "Одежда для ног", "/p15/nouns/clothing/trousers.svg"),
            _stimulus("clothes-dress", "Платье", "Цельная одежда с юбкой", "/p15/nouns/clothing/dress.svg"),
            _stimulus("clothes-shoes", "Ботинки", "Пара обуви", "/p15/nouns/clothing/shoes.svg"),
            _stimulus("clothes-hat", "Шапка", "Одежда для головы", "/p15/nouns/clothing/hat.svg"),
            _stimulus("clothes-jacket", "Куртка", "Верхняя одежда с застёжкой", "/p15/nouns/clothing/jacket.svg"),
        ],
        "ambiguities": ["Названия одежды различаются по семейному словарю: «ботинки/туфли», «кофта/куртка»", "Не связывать одежду с полом ребёнка"],
        "transfer": ["Выбрать названную вещь перед одеванием", "Положить одну знакомую вещь в шкаф по просьбе"],
    },
    {
        "target": "p15-nouns-home",
        "title": "Понимание слов: предметы дома",
        "difficulty": 1,
        "stimuli": [
            _stimulus("home-cup", "Чашка", "Посуда с ручкой", "/p15/nouns/home/cup.svg"),
            _stimulus("home-spoon", "Ложка", "Столовый прибор с округлой чашечкой", "/p15/nouns/home/spoon.svg"),
            _stimulus("home-chair", "Стул", "Предмет мебели со спинкой", "/p15/nouns/home/chair.svg"),
            _stimulus("home-bed", "Кровать", "Место для сна с подушкой", "/p15/nouns/home/bed.svg"),
            _stimulus("home-lamp", "Лампа", "Светильник с абажуром", "/p15/nouns/home/lamp.svg"),
            _stimulus("home-book", "Книга", "Закрытая книга с видимыми страницами", "/p15/nouns/home/book.svg"),
        ],
        "ambiguities": ["Форма чашки и мебели может отличаться от предметов дома ребёнка", "Книга относится и к теме занятий; контекст не должен раскрывать ответ"],
        "transfer": ["Найти предмет в знакомой комнате", "Передать названный безопасный предмет взрослому"],
    },
    {
        "target": "p15-nouns-body",
        "title": "Понимание слов: части тела",
        "difficulty": 1,
        "stimuli": [
            _stimulus("body-hand", "Рука", "Открытая ладонь и пальцы", "/p15/nouns/body/hand.svg"),
            _stimulus("body-foot", "Нога", "Стопа и нижняя часть ноги", "/p15/nouns/body/foot.svg"),
            _stimulus("body-nose", "Нос", "Нос на нейтральном фрагменте лица", "/p15/nouns/body/nose.svg"),
            _stimulus("body-ear", "Ухо", "Ухо сбоку головы", "/p15/nouns/body/ear.svg"),
            _stimulus("body-eyes", "Глаза", "Пара открытых глаз", "/p15/nouns/body/eyes.svg"),
            _stimulus("body-mouth", "Рот", "Спокойно закрытый рот", "/p15/nouns/body/mouth.svg"),
        ],
        "ambiguities": ["В разговорной речи «нога» может означать всю конечность или стопу", "Изолированные фрагменты лица должны быть проверены на комфорт и узнаваемость"],
        "transfer": ["Показать названную часть тела на себе или игрушке", "Использовать слово в бытовой ситуации ухода без требования повторения"],
    },
)


def _noun_fixture(item: dict[str, Any]) -> dict[str, Any]:
    instruction = "Послушай слово и покажи картинку"
    assets = [_asset(stimulus["media_ref"]) for stimulus in item["stimuli"]]
    return {
        "target": item["target"],
        "module": "sensory",
        "title": item["title"],
        "instruction": instruction,
        "difficulty": item["difficulty"],
        "skill": "vocabulary",
        "icon": "/illustrations/module-listening.png",
        "mechanic": "auditory_choice",
        "objective": "Сопоставить услышанное знакомое существительное с однозначной иллюстрацией",
        "response_mode": "single_tap",
        "prompt_policy": {"steps": PROMPT_STEPS, "time_limit": None, "max_attempts": 3},
        "completion_rule": {"rounds": 6, "success": "matching_stimulus_key"},
        "content": {
            "theme": item["target"],
            "difficulty_levels": DIFFICULTY_LEVELS,
            "stimuli": item["stimuli"],
            "asset_registry": assets,
        },
        "method_card": _method_card(
            target_skill="Понимание знакомых существительных на слух",
            skill_group=["понимание предметов", "словарное понимание"],
            child_instruction=instruction,
            stimuli_and_responses=f"Шесть изолированных изображений темы «{item['title'].split(': ', 1)[-1]}»; ответ — одно нажатие по изображению после аудио.",
            ambiguities=item["ambiguities"],
            transfer=item["transfer"],
        ),
    }


ACTION_STIMULI = [
    _stimulus("action-eat", "Ест", "Человек подносит ложку от тарелки ко рту", "/p1/actions/eat.svg", speech="Кто ест?", alt="Ребёнок ест ложкой за столом"),
    _stimulus("action-drink", "Пьёт", "Человек держит стакан у рта", "/p1/actions/drink.svg", speech="Кто пьёт?", alt="Ребёнок пьёт из стакана"),
    _stimulus("action-sleep", "Спит", "Человек лежит с закрытыми глазами", "/p1/actions/sleep.svg", speech="Кто спит?", alt="Ребёнок спит в кровати"),
    _stimulus("action-walk", "Идёт", "Одна нога впереди, спокойный шаг", "/p15/actions/walk.svg", speech="Кто идёт?", alt="Ребёнок идёт с рюкзаком"),
    _stimulus("action-run", "Бежит", "Обе ноги в движении, корпус наклонён", "/p1/actions/run.svg", speech="Кто бежит?", alt="Ребёнок бежит"),
    _stimulus("action-sit", "Сидит", "Человек опирается на сиденье стула", "/p15/actions/sit.svg", speech="Кто сидит?", alt="Ребёнок сидит на стуле"),
    _stimulus("action-stand", "Стоит", "Человек неподвижно стоит на двух ногах", "/p15/actions/stand.svg", speech="Кто стоит?", alt="Ребёнок стоит"),
    _stimulus("action-wash", "Моет", "Руки под струёй воды у раковины", "/p15/actions/wash.svg", speech="Кто моет руки?", alt="Ребёнок моет руки"),
    _stimulus("action-play", "Играет", "Человек действует с мячом", "/p1/actions/play.svg", speech="Кто играет?", alt="Ребёнок играет с мячом"),
    _stimulus("action-read", "Читает", "Открытая книга находится перед глазами", "/p15/actions/read.svg", speech="Кто читает?", alt="Взрослый читает открытую книгу"),
]


ACTION_FIXTURE: dict[str, Any] = {
    "target": "p15-actions-core",
    "module": "sensory",
    "title": "Понимание действий: знакомые действия",
    "instruction": "Послушай вопрос и покажи, кто это делает",
    "difficulty": 2,
    "skill": "speech_comprehension",
    "icon": "/illustrations/module-listening.png",
    "mechanic": "action_choice",
    "objective": "Сопоставить услышанный глагол с однозначно изображённым действием",
    "response_mode": "single_tap",
    "prompt_policy": {"steps": PROMPT_STEPS, "time_limit": None, "max_attempts": 3},
    "completion_rule": {"rounds": 6, "success": "matching_stimulus_key"},
    "content": {
        "theme": "core-actions",
        "difficulty_levels": DIFFICULTY_LEVELS,
        "stimuli": ACTION_STIMULI,
        "asset_registry": [_asset(item["media_ref"]) for item in ACTION_STIMULI],
    },
    "method_card": _method_card(
        target_skill="Понимание знакомых действий на слух",
        skill_group=["понимание действий", "понимание вопросов «Кто…?»"],
        child_instruction="Послушай вопрос и покажи, кто это делает",
        stimuli_and_responses="Десять полноценных сцен действий; правильный ответ задаётся стабильным ключом, а не предметом или позицией.",
        ambiguities=[
            "Сцена должна показывать само действие, а не только связанный предмет",
            "«Идёт» и «бежит», «сидит» и «стоит» требуют проверки как контрастные пары",
            "Персонажи различаются внешне, но правильность не должна зависеть от конкретного персонажа",
        ],
        transfer=["Показать действие взрослого или персонажа в книге", "Назвать действие во время знакомой бытовой ситуации"],
    ),
}


def _object(key: str, label: str, role: str, path: str) -> dict[str, str]:
    return {"key": key, "label": label, "role": role, "media_ref": path}


INSTRUCTION_SCENARIOS: list[dict[str, Any]] = [
    {
        "key": "take-ball",
        "category": "take",
        "difficulty": 1,
        "instruction": "Возьми мяч",
        "speech": "Возьми мяч",
        "objects": [_object("ball", "Мяч", "movable", "/p15/nouns/toys/ball.svg"), _object("book", "Книга", "movable", "/p15/nouns/home/book.svg"), _object("hand", "Взять", "target", "/p15/objects/hand.svg"), _object("box", "Коробка", "target", "/p1/objects/box.svg")],
        "success": {"object_key": "ball", "target_key": "hand"},
    },
    {
        "key": "take-cup",
        "category": "take",
        "difficulty": 2,
        "instruction": "Возьми чашку",
        "speech": "Возьми чашку",
        "objects": [_object("cup", "Чашка", "movable", "/p15/nouns/home/cup.svg"), _object("spoon", "Ложка", "movable", "/p15/nouns/home/spoon.svg"), _object("hand", "Взять", "target", "/p15/objects/hand.svg"), _object("table", "Стол", "target", "/p15/objects/table.svg")],
        "success": {"object_key": "cup", "target_key": "hand"},
    },
    {
        "key": "give-apple-bear",
        "category": "give",
        "difficulty": 1,
        "instruction": "Дай мишке яблоко",
        "speech": "Дай мишке яблоко",
        "objects": [_object("apple", "Яблоко", "movable", "/p15/nouns/food/apple.svg"), _object("banana", "Банан", "movable", "/p15/nouns/food/banana.svg"), _object("bear", "Мишка", "target", "/p1/objects/bear.svg"), _object("adult", "Взрослый", "target", "/p1/objects/adult.svg")],
        "success": {"object_key": "apple", "target_key": "bear"},
    },
    {
        "key": "give-cup-adult",
        "category": "give",
        "difficulty": 2,
        "instruction": "Дай взрослому чашку",
        "speech": "Дай взрослому чашку",
        "objects": [_object("cup", "Чашка", "movable", "/p15/nouns/home/cup.svg"), _object("book", "Книга", "movable", "/p15/nouns/home/book.svg"), _object("adult", "Взрослый", "target", "/p1/objects/adult.svg"), _object("bear", "Мишка", "target", "/p1/objects/bear.svg")],
        "success": {"object_key": "cup", "target_key": "adult"},
    },
    {
        "key": "put-ball-box",
        "category": "in",
        "difficulty": 1,
        "instruction": "Положи мяч в коробку",
        "speech": "Положи мяч в коробку",
        "objects": [_object("ball", "Мяч", "movable", "/p15/nouns/toys/ball.svg"), _object("doll", "Кукла", "movable", "/p15/nouns/toys/doll.svg"), _object("box", "Коробка", "target", "/p1/objects/box.svg"), _object("table", "Стол", "target", "/p15/objects/table.svg")],
        "success": {"object_key": "ball", "target_key": "box"},
    },
    {
        "key": "put-book-box",
        "category": "in",
        "difficulty": 2,
        "instruction": "Положи книгу в коробку",
        "speech": "Положи книгу в коробку",
        "objects": [_object("book", "Книга", "movable", "/p15/nouns/home/book.svg"), _object("cup", "Чашка", "movable", "/p15/nouns/home/cup.svg"), _object("box", "Коробка", "target", "/p1/objects/box.svg"), _object("chair", "Стул", "target", "/p15/nouns/home/chair.svg")],
        "success": {"object_key": "book", "target_key": "box"},
    },
    {
        "key": "put-cup-table",
        "category": "on",
        "difficulty": 2,
        "instruction": "Поставь чашку на стол",
        "speech": "Поставь чашку на стол",
        "objects": [_object("cup", "Чашка", "movable", "/p15/nouns/home/cup.svg"), _object("apple", "Яблоко", "movable", "/p15/nouns/food/apple.svg"), _object("table", "Стол", "target", "/p15/objects/table.svg"), _object("box", "Коробка", "target", "/p1/objects/box.svg")],
        "success": {"object_key": "cup", "target_key": "table"},
    },
    {
        "key": "put-book-table",
        "category": "on",
        "difficulty": 3,
        "instruction": "Положи книгу на стол",
        "speech": "Положи книгу на стол",
        "objects": [_object("book", "Книга", "movable", "/p15/nouns/home/book.svg"), _object("puzzle", "Пазл", "movable", "/p15/nouns/toys/puzzle.svg"), _object("table", "Стол", "target", "/p15/objects/table.svg"), _object("chair", "Стул", "target", "/p15/nouns/home/chair.svg")],
        "success": {"object_key": "book", "target_key": "table"},
    },
    {
        "key": "ball-next-chair",
        "category": "next_to",
        "difficulty": 3,
        "instruction": "Положи мяч рядом со стулом",
        "speech": "Положи мяч рядом со стулом",
        "objects": [_object("ball", "Мяч", "movable", "/p15/nouns/toys/ball.svg"), _object("drum", "Барабан", "movable", "/p15/nouns/toys/drum.svg"), _object("chair", "Стул", "target", "/p15/nouns/home/chair.svg"), _object("table", "Стол", "target", "/p15/objects/table.svg")],
        "success": {"object_key": "ball", "target_key": "chair"},
    },
    {
        "key": "doll-next-bear",
        "category": "next_to",
        "difficulty": 3,
        "instruction": "Положи куклу рядом с мишкой",
        "speech": "Положи куклу рядом с мишкой",
        "objects": [_object("doll", "Кукла", "movable", "/p15/nouns/toys/doll.svg"), _object("book", "Книга", "movable", "/p15/nouns/home/book.svg"), _object("bear", "Мишка", "target", "/p1/objects/bear.svg"), _object("adult", "Взрослый", "target", "/p1/objects/adult.svg")],
        "success": {"object_key": "doll", "target_key": "bear"},
    },
]


INSTRUCTION_FIXTURE: dict[str, Any] = {
    "target": "p15-instructions-one-step",
    "module": "sensory",
    "title": "Одношаговые инструкции: предмет и место",
    "instruction": "Послушай и выполни одно действие на экране",
    "difficulty": 1,
    "skill": "speech_comprehension",
    "icon": "/illustrations/module-listening.png",
    "mechanic": "tap_instruction",
    "objective": "Выполнить одну устную инструкцию выбором предмета и цели действия",
    "response_mode": "tap_sequence",
    "prompt_policy": {"steps": ["repeat_audio", "highlight_movable", "highlight_target", "model_answer"], "time_limit": None, "max_attempts": 3},
    "completion_rule": {"success": "matching_object_and_target", "steps": 1},
    "content": {
        "scenarios": INSTRUCTION_SCENARIOS,
        "difficulty_levels": [
            {"level": 1, "scenario_categories": ["take", "give", "in"]},
            {"level": 2, "scenario_categories": ["give", "in", "on"]},
            {"level": 3, "scenario_categories": ["on", "next_to"]},
        ],
        "asset_registry": [_asset(path) for path in sorted({obj["media_ref"] for scenario in INSTRUCTION_SCENARIOS for obj in scenario["objects"]})],
    },
    "method_card": _method_card(
        target_skill="Понимание и выполнение одношаговой инструкции с предметом и целью",
        skill_group=["понимание инструкций", "пространственные отношения", "выбор предмета и цели"],
        child_instruction="Послушай и выполни одно действие на экране",
        stimuli_and_responses="Десять одношаговых сценариев пяти типов. Ответ состоит из двух нажатий: предмет, затем цель; это не выбор одной картинки.",
        prerequisites=["Различает предмет и место/персонажа на экране", "Может сделать два последовательных нажатия", "Понимает формат короткой инструкции после демонстрации"],
        accepted_responses=["Правильная последовательность предмет → цель", "Последовательность после отмеченной подсказки", "Просьба о помощи, перерыв или отказ как отдельный исход"],
        ambiguities=["«Возьми» моделируется переносом к изображению руки; специалист должен подтвердить понятность", "«Рядом» пока проверяет выбор целевого предмета, а не точную геометрию размещения", "«Дай» требует различать получателя и место"],
        transfer=["Выполнить ту же инструкцию с безопасными предметами дома", "Попросить передать знакомый предмет взрослому или положить его в коробку"],
        result_rules=["Хранить оба выбранных ключа и порядок нажатий", "Отдельно отмечать самостоятельное выполнение, подсказку, модель и остановку", "Не интерпретировать результат как диагностическую оценку понимания речи"],
    ),
}


P15_EXERCISE_DRAFTS: tuple[dict[str, Any], ...] = tuple(_noun_fixture(item) for item in NOUN_SETS) + (ACTION_FIXTURE, INSTRUCTION_FIXTURE)


EXISTING_HOME_METHOD_CARDS: dict[str, dict[str, Any]] = {
    "find-home-item": {"prerequisites": ["Два безопасных знакомых предмета"], "ambiguities": ["Взгляд может быть понятным ответом только если взрослый уверен, какой предмет выбран"], "transfer": ["Повторить в другой комнате с тем же словом"], "sources": [], "methodology_review_status": "pending"},
    "feed-bear": {"prerequisites": ["Знакомая сюжетная игрушка"], "ambiguities": ["Поднесение предмета и кормление должны быть различимы взрослому"], "transfer": ["Повторить с другой игрушкой без усложнения инструкции"], "sources": [], "methodology_review_status": "pending"},
    "tidy-toys": {"prerequisites": ["Одна игрушка и хорошо видимая коробка"], "ambiguities": ["Уборка не должна превращаться в длинную последовательность требований"], "transfer": ["Использовать одну инструкцию в естественном завершении игры"], "sources": [], "methodology_review_status": "pending"},
    "ask-for-help": {"prerequisites": ["Доступен безопасный способ отказаться и карточка «Помоги»"], "ambiguities": ["Ситуация не должна намеренно вызывать сильную фрустрацию"], "transfer": ["Сразу помогать после любого понятного запроса"], "sources": [], "methodology_review_status": "pending"},
    "show-action": {"prerequisites": ["Знакомые предметы и действия"], "ambiguities": ["Выбор связанного предмета не всегда доказывает понимание глагола"], "transfer": ["Показать то же действие в книге и в реальной ситуации"], "sources": [], "methodology_review_status": "pending"},
}


EXTRA_HOME_ACTIVITY_DRAFTS: tuple[dict[str, Any], ...] = (
    {
        "key": "choose-clothes",
        "title": "Выбери одежду",
        "objective": "Сделать понятный выбор между двумя подходящими вещами",
        "materials": ["Две знакомые сезонные вещи"],
        "adult_instructions": ["Положите две вещи рядом", "Спросите: «Что наденем?»", "Примите взгляд, жест, слово или AAC и используйте выбранную вещь"],
        "accepted_responses": ["Показывает или берёт вещь", "Называет вещь", "Выбирает AAC-карточку", "Отказывается от обоих вариантов"],
        "prompts": ["Повторите вопрос", "Поочерёдно покажите варианты без оценки", "Смоделируйте доступный способ выбора"],
        "stop_conditions": ["Отказ", "Дискомфорт от одежды", "Нужно одеться без задержки"],
        "method_card": {"prerequisites": ["Обе вещи безопасны и подходят по ситуации"], "ambiguities": ["Взрослый не предлагает вариант, который нельзя принять"], "transfer": ["Повторить выбор обуви или аксессуара"], "sources": [], "methodology_review_status": "pending"},
    },
    {
        "key": "shared-reading",
        "title": "Совместное чтение",
        "objective": "Поддержать совместное внимание и понимание знакомых слов в книге",
        "materials": ["Короткая знакомая книга с крупными изображениями"],
        "adult_instructions": ["Откройте одну страницу", "Назовите один объект или действие", "Подождите и примите взгляд, жест, касание или AAC"],
        "accepted_responses": ["Смотрит на нужное изображение", "Показывает его", "Комментирует жестом, словом или AAC", "Просит перелистнуть"],
        "prompts": ["Повторите слово", "Покажите область страницы", "Покажите модель один раз и продолжите чтение"],
        "stop_conditions": ["Закрывает книгу", "Отворачивается или уходит", "Просит перерыв"],
        "method_card": {"prerequisites": ["Книга комфортна ребёнку и не содержит пугающих сцен"], "ambiguities": ["Взгляд не всегда означает выбор; не требовать подтверждения"], "transfer": ["Вернуться к тому же слову на другой странице"], "sources": [], "methodology_review_status": "pending"},
    },
    {
        "key": "dishes-play",
        "title": "Игры с посудой",
        "objective": "Понимать названия знакомой посуды и одно действие с ней",
        "materials": ["Безопасные чашка, ложка и тарелка"],
        "adult_instructions": ["Положите два предмета перед ребёнком", "Дайте одну короткую инструкцию, например «Дай ложку»", "После одного действия завершите попытку"],
        "accepted_responses": ["Передаёт предмет", "Показывает предмет", "Просит помощь", "Отказывается"],
        "prompts": ["Повторите инструкцию", "Сократите выбор", "Покажите действие с другим предметом"],
        "stop_conditions": ["Посуда становится небезопасной", "Отказ или перерыв", "Игра вызывает раздражение"],
        "method_card": {"prerequisites": ["Только небьющаяся безопасная посуда"], "ambiguities": ["Не смешивать несколько действий в одной инструкции"], "transfer": ["Повторить во время сервировки"], "sources": [], "methodology_review_status": "pending"},
    },
    {
        "key": "search-familiar-items",
        "title": "Поиск знакомых предметов",
        "objective": "Найти знакомый предмет по короткой устной инструкции",
        "materials": ["Три знакомых безопасных предмета в одной видимой зоне"],
        "adult_instructions": ["Назовите один предмет", "Не подсказывайте взглядом", "После выбора перенесите предмет в естественное действие"],
        "accepted_responses": ["Подходит к предмету", "Показывает или приносит предмет", "Отвечает AAC", "Просит помощь"],
        "prompts": ["Повторите слово", "Ограничьте зону поиска", "Оставьте два предмета"],
        "stop_conditions": ["Ребёнок уходит из безопасной зоны", "Отказ", "Предмет недоступен или поиск затянулся"],
        "method_card": {"prerequisites": ["Все предметы видимы и безопасны"], "ambiguities": ["Не прятать предмет так, чтобы проверялась память вместо понимания слова"], "transfer": ["Искать тот же предмет в другой знакомой комнате"], "sources": [], "methodology_review_status": "pending"},
    },
    {
        "key": "ask-more",
        "title": "Попроси «ещё»",
        "objective": "Использовать доступный способ попросить продолжение приятного действия",
        "materials": ["Короткое знакомое действие или небольшая порция доступного материала", "AAC-карточка «Ещё»"],
        "adult_instructions": ["Сделайте короткую естественную паузу", "Подождите инициативу", "Сразу продолжите после любого понятного запроса"],
        "accepted_responses": ["Карточка «Ещё»", "Жест, взгляд или звук, понятный семье", "Слово или короткая фраза", "Отказ продолжать"],
        "prompts": ["Покажите карточку «Ещё»", "Скажите: «Можно попросить ещё»", "Смоделируйте один раз"],
        "stop_conditions": ["Нет интереса к продолжению", "Расстройство", "Взрослый уже понял просьбу — не требовать повторения"],
        "method_card": {"prerequisites": ["Действие действительно доступно для продолжения"], "ambiguities": ["Нельзя удерживать базовую потребность ради вызова просьбы"], "transfer": ["Использовать в другой приятной совместной игре"], "sources": [], "methodology_review_status": "pending"},
    },
    {
        "key": "use-no-stop",
        "title": "Используй «нет» и «стоп»",
        "objective": "Закрепить, что отказ и остановка сразу меняют действие взрослого",
        "materials": ["Карточки «Нет» и «Стоп»", "Нейтральная короткая игра"],
        "adult_instructions": ["Покажите способы остановить игру", "Начните нейтральное действие", "После любого отказа немедленно остановитесь"],
        "accepted_responses": ["Карточка", "Жест", "Отворачивание или отодвигание", "Слово или звук, понятный взрослому"],
        "prompts": ["Покажите карточки до начала", "Смоделируйте «стоп» на себе", "Не подсказывайте повторно после уже понятного отказа"],
        "stop_conditions": ["Любой понятный отказ", "Дискомфорт", "Ребёнок покидает ситуацию"],
        "method_card": {"prerequisites": ["Взрослый готов немедленно принять отказ"], "ambiguities": ["Это не проверка послушания и не тренировка терпеть неприятное"], "transfer": ["Принимать «нет» и «стоп» во всех бытовых ситуациях, где выбор возможен"], "sources": [], "methodology_review_status": "pending"},
    },
    {
        "key": "describe-actions",
        "title": "Опиши простое действие",
        "objective": "Сообщить о знакомом действии доступным способом",
        "materials": ["Два знакомых действия взрослого или игрушки", "Доступные AAC-карточки действий"],
        "adult_instructions": ["Покажите одно короткое действие", "Спросите: «Что делает?»", "Примите жест, карточку, слово или показ действия"],
        "accepted_responses": ["Выбирает карточку действия", "Показывает действие", "Называет действие", "Просит помощь или отказывается"],
        "prompts": ["Повторите вопрос", "Предложите две карточки", "Смоделируйте ответ один раз"],
        "stop_conditions": ["Отказ или перерыв", "Действие непонятно", "Повторение вызывает усталость"],
        "method_card": {"prerequisites": ["Действия знакомы ребёнку"], "ambiguities": ["Выбор предмета, связанного с действием, не всегда равен описанию действия"], "transfer": ["Комментировать одно действие в книге или дома"], "sources": [], "methodology_review_status": "pending"},
    },
)


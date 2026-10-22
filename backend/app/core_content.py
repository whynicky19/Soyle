"""Research-informed review material. AI preparation never grants release approval.

Keep old fixture modules intact: persisted versions/results refer to them.
"""
from .p15_content import _method_card

ROOT = "/learning-core/words"
SOURCES = [
    {"title": "Ansari et al., 2025", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11962024/", "population": "Дети 5–11 лет с DLD", "scope": "Общий подход: явное обучение словам и контекст; не проверка Söyle", "limitation": "Не доказательство эффективности данной механики, дошкольной или русскоязычной популяции"},
    {"title": "ASHA Spoken Language Disorders", "url": "https://www.asha.org/practice-portal/clinical-topics/spoken-language-disorders/", "population": "Дети 3–21 года с нарушениями устной речи", "scope": "Индивидуальный подбор по языковому профилю", "limitation": "Профессиональная рекомендация; не испытание приложения"},
    {"title": "Roberts et al., 2019", "url": "https://pubmed.ncbi.nlm.nih.gov/31107508/", "population": "Дети в исследованиях со средним возрастом менее 6 лет; разные профили", "scope": "Обучение родителей стратегиям общения", "limitation": "Короткая памятка в приложении не равна исследованной программе обучения родителей"},
]

WORD_CORE = {
    "target": "household", "module": "sensory", "title": "Знакомые предметы: разные примеры",
    "instruction": "Послушай и покажи предмет", "difficulty": 1, "skill": "speech_comprehension",
    "icon": f"{ROOT}/cup-a.webp", "mechanic": "auditory_choice",
    "objective": "Выбрать названный предмет среди сопоставимых изображений, затем узнать другой его пример",
    "response_mode": "single_tap",
    "prompt_policy": {"steps": ["repeat_audio", "reduced_choice", "model_answer"], "time_limit": None},
    "completion_rule": {"rounds": 8, "success": "matching_stimulus_key"},
    "content": {
        "revision": "core-words-2026-10-22-r2",
        "difficulty_levels": [{"level": level, "option_count": level + 1, "rounds": 8, "max_attempts": 3} for level in (1, 2, 3)],
        "stimuli": [{"key": key, "label": label, "speech": label, "hint": "Послушай слово ещё раз", "media_ref": f"{ROOT}/{key}-a.webp", "exemplars": [f"{ROOT}/{key}-b.webp"], "alt": alt} for key, label, alt in (
            ("ball", "Мяч", "Резиновый мяч"), ("cup", "Чашка", "Чашка с ручкой"),
            ("book", "Книга", "Книга со страницами"), ("spoon", "Ложка", "Ложка с ручкой и углублением"))],
        "asset_registry": [{"media_ref": f"{ROOT}/{key}-{variant}.webp", "origin": "Сгенерированная предметная иллюстрация; встроенный imagegen", "license": "Синтетический проектный ресурс; не фотография ребёнка", "license_status": "documented"} for key in ("ball", "cup", "book", "spoon") for variant in ("a", "b")],
    },
    "method_card": _method_card(
        target_skill="Выбор знакомого предмета по услышанному слову на разных изображениях",
        skill_group=["понимание слов", "новые примеры"], child_instruction="Послушай и покажи предмет",
        stimuli_and_responses="Четыре понятия, по две разные предметные иллюстрации. Одно нажатие после завершения озвучки.",
        prerequisites=["Знаком с реальными предметами", "Слышит инструкцию в комфортном режиме", "Может выбрать одну из двух картинок; взрослый может помочь с интерфейсом, отметив помощь"],
        accepted_responses=["Нажатие на изображение названного предмета", "Ответ после повторения или иной помощи с отдельной отметкой", "Отказ или перерыв без ошибки"],
        ambiguities=["Узнавание синтетической иллюстрации не доказывает понимание слова в быту", "Вариант B меняет цвет и форму/ракурс; это продуктовая проверка нового примера, не стандартизированная проба", "Восемь раундов — продуктовая настройка; можно остановиться в любой момент"],
        transfer=["Подготовьте реальную чашку и ложку. Скажите один раз «Дай чашку». Примите показ, передачу, жест или AAC; не требуйте речи", "Повторите с другой чашкой в обычной игре. Отметьте ответ и помощь отдельно от балла приложения"],
        adult_guidance=["До задания покажите, как нажать на нейтральную кнопку, не называя целевой предмет", "Не указывайте на ответ взглядом или рукой", "После выбора используйте соответствующий безопасный предмет в совместной игре; не задерживайте воду или еду", "При просьбе повторить инструкция повторяется и ответ уже не считается первым самостоятельным"],
        result_rules=["Стабильный ключ понятия, показанный файл и файлы всех вариантов", "Первый выбор, число попыток, последовательность помощи и исход каждого раунда", "Озвучивание всех вариантов — участие без сопоставления со слуховым выбором", "Техническая ошибка, отказ и перерыв отдельно; нет клинического вывода"],
    ),
}
WORD_CORE["method_card"].update(
    difficulty_levels=["2 изображения, 8 раундов", "3 изображения, 8 раундов", "4 изображения, 8 раундов"],
    prompts=["Повтор инструкции", "Сокращение выбора", "Показ образца"],
    sources=SOURCES,
    evidence_note="Источники поддерживают общий подход. Четыре понятия, восемь раундов и два примера — продуктовая гипотеза; эффективность Söyle не исследована. Алалия не приравнивается к DLD или CAS.",
    methodology_review_status="pending",
)
ACTION_ROOT = "/learning-core/actions"
ACTION_CORE = {
    "target": "actions", "module": "sensory", "title": "Что делает ребёнок: одинаковые предметы",
    "instruction": "Послушай и покажи действие", "difficulty": 1, "skill": "speech_comprehension",
    "icon": f"{ACTION_ROOT}/eat.webp", "mechanic": "action_choice",
    "objective": "Различить знакомые действия по позе и взаимодействию при одинаковом наборе предметов",
    "response_mode": "single_tap", "prompt_policy": WORD_CORE["prompt_policy"].copy(),
    "completion_rule": {"rounds": 5, "success": "matching_stimulus_key"},
    "content": {
        "revision": "core-actions-2026-10-22-r2",
        "difficulty_levels": [{"level": level, "option_count": level + 1, "rounds": 5, "max_attempts": 3} for level in (1, 2, 3)],
        "stimuli": [{"key": key, "label": label, "speech": speech, "hint": "Посмотри на лицо, руки и действие", "media_ref": f"{ACTION_ROOT}/{key}.webp", "alt": alt} for key, label, speech, alt in (
            ("eat", "Ест", "Кто ест?", "Ложка с едой у открытого рта"),
            ("drink", "Пьёт", "Кто пьёт?", "Край чашки касается рта, чашка наклонена"),
            ("read", "Смотрит книгу", "Кто смотрит книгу?", "Ребёнок держит открытую книгу и смотрит на страницы"),
            ("play", "Играет с мячом", "Кто играет с мячом?", "Раскрытые руки направляют мяч на столе"),
            ("hold", "Держит чашку", "Кто держит чашку?", "Ребёнок держит чашку ниже лица, не подносит ко рту"))],
        "asset_registry": [{"media_ref": f"{ACTION_ROOT}/{key}.webp", "origin": "Сгенерированная сцена; общий синтетический референс персонажа и обстановки", "license": "Синтетический проектный ресурс; не фотография реального ребёнка", "license_status": "documented"} for key in ("eat", "drink", "read", "play")],
    },
    "method_card": _method_card(
        target_skill="Выбор сцены с названным действием без подсказки уникальным предметом",
        skill_group=["понимание действий"], child_instruction="Послушай и покажи действие",
        stimuli_and_responses="Пять сцен одного персонажа в одной комнате. Во всех есть чашка, миска с ложкой, книга и мяч. Ответ одним нажатием после аудио.",
        prerequisites=["Знаком с действиями еды, питья, рассматривания книги, и игры", "Освоил отдельное нажатие", "Комфортно слышит вопрос"],
        ambiguities=["Пьющий ребёнок также держит чашку: инструкция «Кто держит чашку?» семантически допускает обе сцены; этот контраст не должен выпускаться без изменения формулировки", "Одна поза не доказывает понимание глагола на других исполнителях", "Статичная сцена игры не показывает само движение мяча"],
        transfer=["Покажите одно действие с безопасным предметом и предложите доступный ответ без требования речи", "Сравните с другим исполнителем дома; наблюдение отдельно от игрового результата"],
        adult_guidance=["Не называйте реквизит вместо действия", "Не требуйте взгляда в глаза", "Не задерживайте еду и воду", "При неоднозначном ответе прекратите оценивание и отметьте неоднозначность"],
        result_rules=["Ключ и файл сцены, варианты, первый выбор, помощь и исход", "Просмотр и узнавание реквизита не равны пониманию действия", "Отказ и техническая ошибка отдельно"],
    ),
}
ACTION_CORE["method_card"].update(sources=SOURCES[:2], methodology_review_status="pending", evidence_note="Общая поддержка индивидуальной языковой практики. Конкретные четыре сцены и контроль реквизита — продуктовая гипотеза, не проверенная методика.")
ACTION_CORE["method_card"].update(difficulty_levels=["2 сцены, 5 раундов", "3 сцены, 5 раундов", "4 сцены, 5 раундов"], prompts=["Повтор инструкции", "Сокращение выбора", "Показ образца"])
# Do not install an ambiguous assessed item. The retained source documents why
# the held-cup contrast was rejected before creating a persisted version.
ACTION_CORE["content"]["stimuli"] = [item for item in ACTION_CORE["content"]["stimuli"] if item["key"] != "hold"]
ACTION_CORE["method_card"]["ambiguities"][0] = "Сцена «держит чашку» не включена: пьющий ребёнок тоже держит чашку, поэтому принимаемый ответ был бы неоднозначен. Для будущего контраста нужна другая проверенная формулировка."
ACTION_CORE["method_card"]["stimuli_and_responses"] = "Четыре сцены одного персонажа в одной комнате; одинаковые чашка, миска с ложкой, книга и мяч. Ответ одним нажатием после аудио."
CORE_EXERCISES = (WORD_CORE, ACTION_CORE)

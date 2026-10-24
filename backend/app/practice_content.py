"""Versioned practice material for review. No importing or migration grants approval."""
from copy import deepcopy

from .core_content import ACTION_CORE, WORD_CORE
from .exercise_engine import legacy_engine_payload
from .p15_content import _method_card

REVISION = 'practice-2026-10-24-r1'
SOURCES = [
    {'title': 'ASHA: Spoken Language Disorders', 'url': 'https://www.asha.org/practice-portal/clinical-topics/spoken-language-disorders/', 'scope': 'Индивидуальный выбор языковых целей и контекстов практики', 'limitation': 'Не исследование Söyle; число раундов и иллюстрации требуют отдельной проверки'},
    {'title': 'ASHA: Augmentative and Alternative Communication', 'url': 'https://www.asha.org/practice-portal/professional-issues/augmentative-and-alternative-communication/', 'scope': 'Доступные способы общения, участие партнёров и функциональное использование', 'limitation': 'Экранное действие не подтверждает перенос навыка в жизнь'},
]


def assets(paths):
    return [{'media_ref': path, 'origin': 'Проектная учебная иллюстрация; AI-растр или редактируемый SVG проекта',
             'license': 'Проектный ресурс Söyle; не изображение реального ребёнка', 'license_status': 'documented'} for path in sorted(set(paths))]


def levels():
    return [{'level': level, 'option_count': level + 1, 'rounds': 4 if level == 1 else 6 if level == 2 else 8, 'max_attempts': 3} for level in (1, 2, 3)]


def passport(card):
    card['sources'] = deepcopy(SOURCES)
    card['evidence_note'] = 'Источники поддерживают общий индивидуальный и функциональный подход. Этот набор, иллюстрации, 4–8 раундов и порядок помощи — продуктовая гипотеза. Эффективность Söyle не исследована; нужна независимая русскоязычная методическая проверка.'
    card['methodology_review_status'] = 'pending'
    return card


WORDS = deepcopy(WORD_CORE)
WORDS['title'] = 'Знакомые предметы: короткая практика с разными примерами'
WORDS['content'].update(revision=REVISION, difficulty_levels=levels(), exemplar_policy='matched_set')
WORDS['completion_rule']['rounds'] = 4
WORDS['method_card'] = passport(WORDS['method_card'])
WORDS['method_card']['difficulty_levels'] = ['2 картинки, 4 раунда', '3 картинки, 6 раундов', '4 картинки, 8 раундов']
WORDS['method_card']['stimuli_and_responses'] = 'Четыре понятия и по два разных изображения. В одном раунде все варианты относятся к одной серии; второй показ понятия меняет пример. Ответ одним нажатием после аудио.'
WORDS['method_card']['ambiguities'] = ['Четыре понятия — материал практики, а не подтверждение цели «5 предметов»', 'Различение изображений не доказывает узнавание реального предмета', 'Количество вариантов меняет зрительную нагрузку; больше раундов не означает лучшее развитие']

ACTIONS = deepcopy(ACTION_CORE)
ACTIONS['title'] = 'Знакомые действия: разные дети, одинаковые предметы'
ACTIONS['difficulty'] = 1
ACTIONS['content'].update(revision=REVISION, difficulty_levels=levels(), exemplar_policy='matched_set')
ACTIONS['completion_rule']['rounds'] = 4
for item in ACTIONS['content']['stimuli']:
    item['exemplars'] = [f"/learning-practice/actions/{item['key']}-b.png"]
    item['hint'] = 'Можно ещё раз послушать вопрос или посмотреть действие вместе'
ACTIONS['content']['asset_registry'] = assets([path for item in ACTIONS['content']['stimuli'] for path in [item['media_ref'], *item['exemplars']]])
ACTIONS['method_card'] = passport(ACTIONS['method_card'])
ACTIONS['method_card'].update(
    stimuli_and_responses='Четыре действия: ест, пьёт, смотрит книгу, играет с мячом. Две серии по четыре сцены с разными детьми. В каждом раунде все сцены одной серии и содержат чашку, миску с ложкой, книгу и мяч. Верный ответ нельзя найти только по наличию реквизита.',
    difficulty_levels=['2 сцены, 4 раунда', '3 сцены, 6 раундов', '4 сцены, 8 раундов'],
    ambiguities=['Сцена «держит чашку» исключена: пьющий ребёнок тоже держит чашку', 'Смотрит книгу не равно читает: речь и чтение здесь не проверяются', 'В статичной сцене нельзя измерить траекторию мяча; вопрос только про игру с мячом', 'Разные дети и серии не считаются стандартизированной проверкой переноса'],
    real_life_transfer=['Взрослый сам выполняет одно знакомое действие и спрашивает «Кто пьёт?»; примите показ, жест или AAC', 'Повторите с другим человеком в обычной ситуации. Запишите ситуацию и помощь по цели «Выбирать изображения знакомых действий», отдельно от балла игры'],
)


def obj(key, label, role, path):
    return {'key': key, 'label': label, 'role': role, 'media_ref': path}


MOVABLE = [obj('ball', 'Мяч', 'movable', '/p15/nouns/toys/ball.svg'), obj('book', 'Книга', 'movable', '/p15/nouns/home/book.svg')]
RECIPIENTS = [obj('bear', 'Мишка', 'target', '/p1/objects/bear.svg'), obj('adult', 'Взрослый', 'target', '/p1/objects/adult.svg')]
PLACES = [obj('box', 'Коробка', 'target', '/p1/objects/box.svg'), obj('table', 'Стол', 'target', '/p15/objects/table.svg')]


def instruction_fixture(target, title, destinations, give):
    scenarios = []
    for object_key, accusative in [('ball', 'мяч'), ('book', 'книгу')]:
        for destination in destinations:
            key = destination['key']
            ending = {'bear': 'мишке', 'adult': 'взрослому', 'box': 'в коробку', 'table': 'на стол'}[key]
            speech = f'Дай {ending} {accusative}' if give else f'Положи {accusative} {ending}'
            result = f"{'Мяч' if object_key == 'ball' else 'Книга'} " + {'bear': 'у мишки.', 'adult': 'у взрослого.', 'box': 'в коробке.', 'table': 'на столе.'}[key]
            scenarios.append({'key': f'{"give" if give else "put"}-{object_key}-{key}', 'instruction': speech, 'speech': speech,
                              'objects': deepcopy([*MOVABLE, *destinations]), 'success': {'object_key': object_key, 'target_key': key},
                              'result': {'relation': 'give' if give else 'in' if key == 'box' else 'on', 'speech': result}})
    card = _method_card(
        target_skill='Понимание одной инструкции: знакомый предмет и получатель' if give else 'Понимание одной инструкции: знакомый предмет и место',
        skill_group=['понимание инструкций'], child_instruction='Послушай. Выбери предмет, затем получателя.' if give else 'Послушай. Выбери предмет, затем место.',
        stimuli_and_responses='Четыре инструкции, два знакомых предмета и две цели. Все четыре сочетания предмета и цели встречаются по одному разу; положение меняется. После ответа видно действие с предметом.',
        prerequisites=['Узнаёт мяч и книгу вне игры', 'Знаком со словами «мишка» и «взрослый»' if give else 'Знаком со словами «коробка», «стол», «в» и «на»', 'Освоил два отдельных нажатия на нейтральном примере; взрослый отмечает помощь'],
        accepted_responses=['Пара предмет → получатель или место на экране', 'Ответ с отдельно отмеченными повтором, подсказкой или показом', 'Жест, AAC или действие с реальным предметом отмечаются взрослым как отдельное бытовое наблюдение', 'Перерыв и отказ принимаются сразу'],
        adult_guidance=['Проверьте доступность звука и знакомство с названиями до занятия', 'Два нажатия — управление интерфейсом; в инструкции только одно языковое действие', 'Не называйте и не показывайте правильный элемент до первого ответа', 'После ошибки ребёнок может повторить вопрос или попросить показ действия', 'Не ведите руку и не требуйте произносить слова'],
        ambiguities=['Верная пара на экране не доказывает выполнения инструкции с реальными предметами', 'Выбор цели после выделения предмета проверяет также удержание короткой инструкции', 'Слово «взрослый» может быть незнакомым; не считать непонимание этого слова отказом выполнять действие' if give else 'Сравниваются коробка и стол, поэтому результат не изолирует понимание предлогов «в» и «на»', 'Показ правильного действия завершает раунд как моделирование, без самостоятельного успеха'],
        transfer=['Подготовьте настоящий мяч и книгу, затем спокойно повторите одну инструкцию. Примите показ, передачу, жест или AAC', 'В другой ситуации повторите с другой книгой и другим взрослым; сохраните наблюдение по цели простых инструкций с уровнем помощи'],
        result_rules=['Сохранять ключ сценария, первую пару, последовательность выборов, использованную помощь и исход', 'Показ образца не увеличивает число правильных самостоятельных ответов', 'Отказ, перерыв и техническая ошибка сохраняются отдельно'],
    )
    card['difficulty_levels'] = ['Фиксированный формат: 2 предмета, 2 цели и 4 одношаговые инструкции; новых языковых шагов не добавляется']
    card['prompts'] = ['Повторить исходную инструкцию', 'Показать действие целиком; отметить моделирование']
    return {'target': target, 'module': 'sensory', 'title': title, 'instruction': card['child_instruction'], 'difficulty': 1, 'skill': 'speech_comprehension',
            'icon': destinations[0]['media_ref'], 'mechanic': 'tap_instruction', 'objective': card['target_skill'], 'response_mode': 'tap_sequence',
            'prompt_policy': {'steps': ['repeat_audio', 'model_answer'], 'time_limit': None, 'max_attempts': 3},
            'completion_rule': {'success': 'matching_object_and_target', 'steps': 1},
            'content': {'revision': REVISION, 'scenarios': scenarios, 'asset_registry': assets([item['media_ref'] for item in [*MOVABLE, *destinations]])},
            'method_card': passport(card)}


GIVE = instruction_fixture('p1-simple-instructions-demo', 'Дай предмет: мишке или взрослому', RECIPIENTS, True)
PUT = instruction_fixture('p15-instructions-one-step', 'Положи предмет: в коробку или на стол', PLACES, False)


def improved_words(target, title):
    engine = deepcopy(legacy_engine_payload({'module': 'sensory', 'target': target, 'title': title}))
    engine['content'].update(revision=REVISION, difficulty_levels=levels())
    engine['completion_rule']['rounds'] = 4
    engine['content']['asset_registry'] = assets([item['media_ref'] for item in engine['content']['stimuli']])
    card = _method_card(target_skill='Выбор названного знакомого предмета или животного', skill_group=['понимание слов'], child_instruction='Послушай слово и покажи картинку',
        stimuli_and_responses='Короткая практика: 4, 6 или 8 раундов; варианты одного набора, без повторения цели до исчерпания понятий.',
        prerequisites=['Знаком с названиями и изображениями выбранного набора', 'Может выбрать одну из двух картинок'],
        ambiguities=['Один рисунок на понятие не подтверждает узнавание других примеров', 'Смысловая подсказка меняет условия ответа и отмечается как помощь'],
        transfer=['Найдите названный предмет среди двух реальных предметов или на другой иллюстрации', 'Запишите первый ответ и помощь по соответствующей цели отдельно от игрового результата'])
    card['difficulty_levels'] = ['2 картинки, 4 раунда', '3 картинки, 6 раундов', '4 картинки, 8 раундов']
    return {'target': target, 'module': 'sensory', 'title': title, 'instruction': card['child_instruction'], 'difficulty': 1, 'skill': 'speech_comprehension',
            'icon': engine['content']['stimuli'][0]['media_ref'], **engine, 'method_card': passport(card)}


PRACTICE_EXERCISES = (WORDS, ACTIONS, GIVE, PUT, improved_words('animals', 'Узнай животное'), improved_words('food', 'Еда и напитки: слушай и выбирай'), improved_words('toys', 'Предметы для игры и творчества'))

"""Larger, versioned concept banks and balanced instruction practice."""
from copy import deepcopy

from .exercise_engine import SENSORY_CONTENT
from .p15_content import _method_card
from .practice_content import SOURCES

REVISION = 'expanded-practice-2026-10-24-r1'
ROOT = '/learning-expanded'


def stimulus(key, label, path, *, speech=None, hint=None):
    return {'key': key, 'label': label, 'speech': speech or label, 'media_ref': path,
            'hint': hint or 'Можно послушать слово ещё раз', 'alt': label}


def new_words(group, items):
    return [stimulus(key, label, f'{ROOT}/{group}/{key}.webp') for key, label in items]


BANKS = {key: deepcopy(SENSORY_CONTENT[key]) for key in ('animals', 'food', 'toys')}
BANKS['animals'] += new_words('animals', [('horse', 'Лошадь'), ('cow', 'Корова'), ('duck', 'Утка'), ('goat', 'Коза')])
BANKS['food'] += new_words('food', [('carrot', 'Морковь'), ('cucumber', 'Огурец'), ('cheese', 'Сыр'), ('egg', 'Яйцо')])
BANKS['toys'] += new_words('toys', [('train', 'Поезд'), ('kite', 'Воздушный змей'), ('pyramid', 'Пирамидка'), ('robot', 'Робот')])
BANKS['home'] = [stimulus(key, label, f'/learning-core/words/{key}-a.webp') for key, label in [('cup', 'Чашка'), ('spoon', 'Ложка'), ('book', 'Книга')]]
BANKS['home'] += [stimulus(key, label, f'/learning-cards/{key}.png') for key, label in [('chair', 'Стул'), ('bed', 'Кровать'), ('lamp', 'Лампа'), ('table', 'Стол'), ('box', 'Коробка')]]
BANKS['home'] += new_words('home', [('plate', 'Тарелка'), ('toothbrush', 'Зубная щётка'), ('towel', 'Полотенце'), ('basket', 'Корзина')])
BANKS['clothing'] = [stimulus(key, label, f'/learning-cards/{key}.png') for key, label in [('shirt', 'Футболка'), ('trousers', 'Брюки'), ('dress', 'Платье'), ('shoes', 'Ботинки'), ('hat', 'Шапка'), ('jacket', 'Куртка')]]
BANKS['clothing'] += new_words('clothing', [('socks', 'Носки'), ('mittens', 'Варежки'), ('scarf', 'Шарф'), ('shorts', 'Шорты'), ('skirt', 'Юбка'), ('boots', 'Сапоги')])
BANKS['body'] = [stimulus(key, label, f'/learning-cards/{key}.png') for key, label in [('hand', 'Рука'), ('foot', 'Нога'), ('nose', 'Нос'), ('ear', 'Ухо'), ('eyes', 'Глаза'), ('mouth', 'Рот')]]
BANKS['body'] += new_words('body', [('head', 'Голова'), ('neck', 'Шея'), ('shoulder', 'Плечо'), ('elbow', 'Локоть'), ('knee', 'Колено'), ('stomach', 'Живот')])
BANKS['actions'] = [stimulus(key, label, f'{ROOT}/actions/{key}.webp', speech=speech, hint='Посмотри, что делает ребёнок') for key, label, speech in [
    ('eat', 'Ест', 'Кто ест?'), ('drink', 'Пьёт', 'Кто пьёт?'), ('read', 'Смотрит книгу', 'Кто смотрит книгу?'),
    ('play', 'Играет с мячом', 'Кто играет с мячом?'), ('sleep', 'Спит', 'Кто спит?'), ('walk', 'Идёт', 'Кто идёт?'),
    ('run', 'Бежит', 'Кто бежит?'), ('wash', 'Моет руки', 'Кто моет руки?'), ('sit', 'Сидит', 'Кто сидит?'),
    ('stand', 'Стоит', 'Кто стоит?'), ('draw', 'Рисует', 'Кто рисует?'), ('clap', 'Хлопает в ладоши', 'Кто хлопает в ладоши?')]]

for bank in BANKS.values():
    for item in bank:
        item.setdefault('alt', item['label'])


TARGET_BANK = {
    'animals': 'animals', 'food': 'food', 'toys': 'toys', 'body': 'body', 'clothes': 'clothing', 'household': 'home',
    'p1-word-runner-demo': 'toys', 'p15-nouns-toys': 'toys', 'p15-nouns-food': 'food', 'p15-nouns-animals': 'animals',
    'p15-nouns-clothing': 'clothing', 'p15-nouns-home': 'home', 'p15-nouns-body': 'body',
    'actions': 'actions', 'p15-actions-core': 'actions',
}
INSTRUCTION_TARGETS = {'p1-simple-instructions-demo': 'give', 'p15-instructions-one-step': 'put'}


def assets(paths):
    return [{'media_ref': path, 'origin': 'Сгенерированная учебная иллюстрация Söyle', 'license': 'Синтетический проектный ресурс Söyle', 'license_status': 'documented'} for path in sorted(set(paths))]


OBJECTS = [
    ('ball', 'Мяч', 'мяч', '/learning-core/words/ball-a.webp'),
    ('book', 'Книга', 'книгу', '/learning-core/words/book-a.webp'),
    ('cup', 'Чашка', 'чашку', '/learning-core/words/cup-a.webp'),
    ('spoon', 'Ложка', 'ложку', '/learning-core/words/spoon-a.webp'),
    ('apple', 'Яблоко', 'яблоко', '/app-illustrations/exercise-stimulus-apple.webp'),
    ('toy-car', 'Машинка', 'машинку', '/app-illustrations/exercise-stimulus-toy-car.webp'),
    ('banana', 'Банан', 'банан', '/app-illustrations/exercise-stimulus-banana.webp'),
    ('blocks', 'Кубики', 'кубики', '/app-illustrations/exercise-stimulus-blocks.webp'),
]
DESTINATIONS = {
    'bear': ('Мишка', 'мишке', 'у мишки', '/learning-cards/bear.png', 'give'),
    'adult': ('Взрослый', 'взрослому', 'у взрослого', '/learning-cards/adult.png', 'give'),
    'box': ('Коробка', 'в коробку', 'в коробке', '/learning-cards/box.png', 'in'),
    'basket': ('Корзина', 'в корзину', 'в корзине', f'{ROOT}/home/basket.webp', 'in'),
    'table': ('Стол', 'на стол', 'на столе', '/learning-cards/table.png', 'on'),
}


def instruction_scenarios(kind):
    destinations = ['bear', 'adult'] if kind == 'give' else ['box', 'basket', 'table']
    scenarios = []
    for index, (object_key, label, accusative, media) in enumerate(OBJECTS):
        for destination in destinations:
            target_label, ending, result_ending, target_media, relation = DESTINATIONS[destination]
            target_other = next(key for key in destinations if key != destination)
            other = OBJECTS[(index + 3) % len(OBJECTS)]
            speech = f'Дай {ending} {accusative}' if kind == 'give' else f'Положи {accusative} {ending}'
            result_path = (f'/learning-cards/results/{object_key}-{destination}.png'
                if object_key in {'ball', 'book'} and destination != 'basket'
                else f'{ROOT}/results/{object_key}-{destination}.webp')
            scenario = {'key': f'{kind}-{object_key}-{destination}', 'instruction': speech, 'speech': speech,
                'objects': [
                    {'key': object_key, 'label': label, 'role': 'movable', 'media_ref': media},
                    {'key': other[0], 'label': other[1], 'role': 'movable', 'media_ref': other[3]},
                    {'key': destination, 'label': target_label, 'role': 'target', 'media_ref': target_media},
                    {'key': target_other, 'label': DESTINATIONS[target_other][0], 'role': 'target', 'media_ref': DESTINATIONS[target_other][3]},
                ], 'success': {'object_key': object_key, 'target_key': destination},
                'result': {'relation': relation, 'speech': f'{label} {result_ending}.', 'media_ref': result_path}}
            scenarios.append(scenario)
    return scenarios


def build_expanded_payload(previous):
    target = previous['target']
    bank = TARGET_BANK.get(target)
    kind = INSTRUCTION_TARGETS.get(target)
    if not bank and not kind:
        return None
    result = deepcopy(previous)
    if bank:
        content = {'revision': REVISION, 'bank_key': bank, 'stimuli': deepcopy(BANKS[bank]),
            'difficulty_levels': [{'level': level, 'option_count': level + 1, 'rounds': 12, 'max_attempts': 3} for level in (1, 2, 3)],
            'round_choices': [12, 18, 24], 'default_rounds': 12, 'max_rounds': 60}
        result['completion_rule'] = {'rounds': 12, 'success': 'matching_stimulus_key'}
        description = '12 разных действий и отдельных сцен одного персонажа' if bank == 'actions' else '12 разных понятий и отдельных изображений'
        ambiguity = 'В статичной сцене поза и реквизит помогают узнавать действие; это не изолированный тест понимания глагола' if bank == 'actions' else 'Одно изображение понятия не подтверждает узнавание других примеров и реальных предметов'
    else:
        scenarios = instruction_scenarios(kind)
        content = {'revision': REVISION, 'bank_key': f'instructions-{kind}', 'scenarios': scenarios,
            'round_choices': [12, len(scenarios)], 'default_rounds': 12}
        result['completion_rule'] = {'steps': 1, 'success': 'matching_object_and_target'}
        description = f'{len(scenarios)} разных инструкций: восемь предметов и {"два получателя" if kind == "give" else "три места"}. В каждой ситуации меняются предмет и отвлекающий вариант'
        ambiguity = 'Сравнение разных контейнеров и поверхностей не изолирует понимание предлогов; результат на экране не доказывает перенос в быт'
    paths = [item['media_ref'] for item in content.get('stimuli', [])]
    for scenario in content.get('scenarios', []):
        paths.extend(item['media_ref'] for item in scenario['objects'])
        paths.append(scenario['result']['media_ref'])
    content['asset_registry'] = assets(paths)
    result['content'] = content
    result['method_card'] = _method_card(
        target_skill=result['objective'], skill_group=['понимание действий' if bank == 'actions' else 'понимание инструкций' if kind else 'понимание слов'],
        child_instruction=result['instruction'], stimuli_and_responses=description + '. Сначала звучит вопрос; до ответа подписи скрыты. Положение ответа меняется.',
        ambiguities=[ambiguity, 'Увеличение набора и длины серии само по себе не доказывает пользу; взрослый выбирает знакомый материал и принимает перерыв'],
        prerequisites=['Знаком с названиями предметов, действий и целей задания', 'Может ответить отдельным нажатием; для инструкции освоил два последовательных нажатия'],
        transfer=['Повторите одну знакомую инструкцию с реальными предметами в обычной игре', 'Попробуйте с другим предметом или человеком и отдельно отметьте помощь и наблюдение'],
        result_rules=['Сохранять первый ответ, ключи и показанные изображения, помощь и исход каждого раунда', 'Показ образца не засчитывается как самостоятельный успех', 'Разделять завершённую серию, продолжение, перерыв, отказ и техническую ошибку'],
    )
    result['method_card'].update(sources=deepcopy(SOURCES), difficulty_levels=['2, 3 или 4 варианта: меняется только число картинок', 'По умолчанию 12 заданий; длину серии можно выбрать отдельно и продолжить после серии'],
        evidence_note='Расширенный банк и длина серии — настройки продукта. Это практика знакомого материала, а не диагностический тест или доказательство эффективности приложения.')
    return result


EXPANDED_SPEECH = tuple([item['speech'] for bank in BANKS.values() for item in bank]
    + [scenario['speech'] for kind in ('give', 'put') for scenario in instruction_scenarios(kind)]
    + [scenario['result']['speech'] for kind in ('give', 'put') for scenario in instruction_scenarios(kind)])

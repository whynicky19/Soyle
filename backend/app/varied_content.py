"""Three distinct, versioned interaction formats; migration creates reviewable drafts."""
from copy import deepcopy
from itertools import combinations

from .expanded_content import BANKS, assets
from .p15_content import _method_card

REVISION = 'varied-practice-2026-10-24-r1'


def media(bank, key):
    return deepcopy(next(item for item in BANKS[bank] if item['key'] == key))


def fixture(target, title, mechanic, objective, instruction, content, description, ambiguity, transfer):
    paths = []
    for group in ('sort_items', 'categories'):
        paths.extend(item['media_ref'] for item in content.get(group, []))
    for task in content.get('tasks', []):
        paths.extend(item['media_ref'] for item in task['cards'])
        paths.extend(item['media_ref'] for item in task.get('targets', []))
    content.update(revision=REVISION, bank_key=target, asset_registry=assets(paths))
    card = _method_card(target_skill=objective, skill_group=['понимание связей и инструкций'],
        child_instruction=instruction, stimuli_and_responses=description, ambiguities=[ambiguity], transfer=[transfer],
        prerequisites=['Узнаёт выбранные предметы и действия', 'Может выбирать отдельным нажатием или с доступным подтверждением взрослого'],
        accepted_responses=['Нажатия на картинки и кнопки', 'Клавиатура: Tab и Enter или пробел'],
        result_rules=['Первое полное решение, исправления, повторы и показ образца сохраняются отдельно', 'Показ образца не считается правильным самостоятельным ответом', 'Перерыв, отказ и технический сбой сохраняются без оценки'])
    card.update(sources=[], difficulty_levels=['Фиксированная механика; длина серии выбирается отдельно'],
        evidence_note='Практика конкретных связей на знакомых иллюстрациях. Результат не подтверждает перенос в быт или клиническую эффективность.')
    return dict(target=target, module='sensory', title=title, mechanic=mechanic, objective=objective,
        instruction=instruction, difficulty=1, icon='/illustrations/module-listening.png', skill='speech_comprehension',
        language='ru', response_mode='tap_sequence', prompt_policy={'repeat': True, 'model': True, 'max_attempts': 3},
        completion_rule={'success': 'complete_exact_solution', 'model_counts_as_success': False}, content=content, method_card=card)


SORT_CATEGORIES = [dict(key=key, label=label, media_ref=media(bank, example)['media_ref']) for key, label, bank, example in [
    ('food', 'Еда', 'food', 'apple'), ('toys', 'Игрушки', 'toys', 'ball'), ('clothing', 'Одежда', 'clothing', 'hat')]]
SORT_ITEMS = []
for bank, keys in [('food', ['apple', 'banana', 'bread', 'carrot', 'cucumber', 'cheese', 'egg', 'porridge']),
                   ('toys', ['ball', 'toy-car', 'blocks', 'doll', 'puzzle', 'train', 'pyramid', 'robot']),
                   ('clothing', ['shirt', 'trousers', 'dress', 'hat', 'socks', 'mittens', 'scarf', 'jacket'])]:
    for key in keys:
        SORT_ITEMS.append(dict(media(bank, key), category_key=bank))

SORT = fixture('sort-familiar-groups', 'Разложи по группам: еда, игрушки, одежда', 'category_sort',
    'Относит знакомый предмет к одной из трёх бытовых групп.', 'Посмотри на предмет и выбери его группу.',
    dict(categories=SORT_CATEGORIES, sort_items=SORT_ITEMS, default_rounds=12, round_choices=[12, 18, 24]),
    '24 предмета: по восемь в каждой группе. Один предмет на экране, три подписанные группы. После ответа предмет попадает в выбранную группу.',
    'Проверяется выбранная бытовая классификация. Предмет может иметь другие функции; спорные предметы не включены.',
    'Разложите настоящие игрушки и одежду в два разных места; отдельно отметьте помощь.')

# The narration explicitly defines the order. No arbitrary daily routine is treated as universal.
STORIES = [
    ('wash', 'eat'), ('eat', 'drink'), ('read', 'sleep'), ('walk', 'sit'), ('play', 'wash'), ('draw', 'clap'),
    ('wash', 'eat', 'drink'), ('walk', 'play', 'sit'), ('draw', 'wash', 'read'),
    ('run', 'sit', 'drink'), ('stand', 'clap', 'sit'), ('play', 'read', 'sleep'),
]
VERBS = dict(eat='ест', drink='пьёт', read='смотрит книгу', play='играет с мячом', sleep='спит',
    walk='идёт', run='бежит', wash='моет руки', sit='сидит', stand='стоит', draw='рисует', clap='хлопает в ладоши')
SEQUENCE_TASKS = []
for index, steps in enumerate(STORIES):
    narration = ' '.join(f'{word} мальчик {VERBS[key]}.' for word, key in zip(['Сначала', 'Потом', 'В конце'], steps))
    distractor = next(key for key in VERBS if key not in steps)
    SEQUENCE_TASKS.append(dict(key=f'story-{index + 1}', instruction=narration + ' Расставь картинки по порядку.',
        cards=[media('actions', key) for key in (*steps, distractor)], correct_order=list(steps)))
SEQUENCE = fixture('order-familiar-actions', 'Сначала — потом: собери историю', 'action_sequence',
    'Выкладывает две или три сцены в порядке, заданном короткой устной историей.',
    'Послушай историю. Выбери, что было сначала, а что потом.',
    dict(tasks=SEQUENCE_TASKS, default_rounds=6, round_choices=[6, 12]),
    '12 коротких историй: шесть из двух действий, шесть из трёх. Картинки перемешаны, одна лишняя. Ребёнок собирает ряд, может отменить выбор и проверяет весь порядок.',
    'Порядок определяет озвученная история, а не единственно верный распорядок дня. Результат зависит также от памяти и понимания слов «сначала» и «потом».',
    'Вспомните два реально выполненных действия и предложите показать их порядок на картинках.')

PAIRS = [('spoon', 'home', 'eat'), ('cup', 'home', 'drink'), ('book', 'home', 'read'),
         ('ball', 'toys', 'play'), ('bed', 'home', 'sleep'), ('paint', 'toys', 'draw'), ('chair', 'home', 'sit')]
# Balanced rotating sets, never the same three pairs twice.
combos = list(combinations(range(len(PAIRS)), 3))
chosen = []
counts = [0] * len(PAIRS)
for _ in range(12):
    group = min((group for group in combos if group not in chosen), key=lambda group: (sum(counts[i] for i in group), group))
    chosen.append(group)
    for i in group:
        counts[i] += 1
PAIR_TASKS = []
for index, group in enumerate(chosen):
    pairs = [PAIRS[i] for i in group]
    PAIR_TASKS.append(dict(key=f'pairs-{index + 1}', instruction='Соедини предмет с действием. Выбери предмет, затем подходящую сцену.',
        cards=[media(bank, key) for key, bank, action in pairs],
        targets=[media('actions', action) for key, bank, action in pairs],
        pairs=[dict(object_key=key, target_key=action) for key, bank, action in pairs]))
MATCH = fixture('match-object-action', 'Что для чего: соедини пары', 'object_match',
    'Соединяет предмет с изображением его знакомого использования.', 'Выбери предмет, затем действие, для которого он нужен.',
    dict(tasks=PAIR_TASKS, default_rounds=6, round_choices=[6, 12]),
    '12 наборов по три пары: ложка — еда, чашка — питьё, книга — чтение, мяч — игра, кровать — сон, краски — рисование, стул — сидение. Найденные пары остаются рядом.',
    'Это привычные связи в показанных сценах, а не запрет других способов использования предметов. Узнавание реквизита не доказывает понимание глагола.',
    'Попросите выбрать предмет для знакомого дела в реальной ситуации; примите другой подходящий предмет.')

VARIED_EXERCISES = (SORT, SEQUENCE, MATCH)
VARIED_SPEECH = tuple(dict.fromkeys([item['instruction'] for item in VARIED_EXERCISES]
    + [task['instruction'] for item in VARIED_EXERCISES for task in item['content'].get('tasks', [])]
    + [group['label'] for group in SORT_CATEGORIES]))

GOAL_TEMPLATES = (
    dict(key='sort-familiar-groups', title='Распределять предметы по группам', skill_category='object_understanding',
         observable_behavior=SORT['objective'], target_outcome='Распределяет знакомые предметы между едой, игрушками и одеждой.'),
    dict(key='order-familiar-actions', title='Понимать «сначала» и «потом»', skill_category='instruction_understanding',
         observable_behavior=SEQUENCE['objective'], target_outcome='Выкладывает два или три действия в порядке услышанной истории.'),
    dict(key='match-object-action', title='Связывать предмет с его использованием', skill_category='object_understanding',
         observable_behavior=MATCH['objective'], target_outcome='Соединяет знакомые предметы со сценами их использования.'),
)
for template, exercise in zip(GOAL_TEMPLATES, VARIED_EXERCISES):
    template.update(baseline_prompt='Укажите знакомые примеры и какая помощь сейчас нужна.',
        accepted_responses=['нажатия на картинки', 'указательный жест с подтверждением взрослого'], default_help_level='full',
        matching_targets=[exercise['target']], matching_mechanics=[exercise['mechanic']])

"""Six illustrated pages with contextual mini-games. Preview participation is never a score."""
from copy import deepcopy
from hashlib import sha256

ROOT = '/storybooks/favorite-toy-book'

def option(key, label, art, feedback, **extra):
    return {'key': key, 'label': label, 'art': art, 'feedback': feedback, **extra}

STORY = {
    'key': 'toy', 'version': 3, 'schema_version': 1, 'status': 'DRAFT', 'review_status': 'pending',
    'title': 'Любимая игрушка', 'subtitle': 'Маленькие открытия. Большая помощь.',
    'review_note': 'Предпросмотр родителя. Иллюстрации, сценарий и AAC требуют проверки перед публикацией детям.',
    'audio': {'status': 'pending', 'clips': {}},
    'scenes': [
        {'id': 'find', 'title': 'Где любимый мишка?', 'kind': 'find', 'narration': 'Миша хочет поиграть. Найди его любимого мишку.', 'instruction': 'Найди мишку в комнате', 'hint': 'Посмотри на правую полку. У мишки бирюзовый бантик.', 'image': f'{ROOT}/find.webp', 'alt': 'Миша на ковре. Мишка на правой полке, поезд и мяч на полу.',
         'options': [option('find_teddy', 'Мишка на полке', 'teddy', 'Вот он! Миша нашёл любимого мишку.', target=True), option('explore_train', 'Поезд на ковре', 'train', 'Это поезд. А где мишка с бантиком?'), option('explore_ball', 'Мяч на ковре', 'ball', 'Мяч можно покатать. Поищем мишку на полке.')],
         'hotspots': [{'action': 'find_teddy', 'x': 87, 'y': 31, 'width': 16, 'height': 27}, {'action': 'explore_train', 'x': 22, 'y': 80, 'width': 22, 'height': 20}, {'action': 'explore_ball', 'x': 69, 'y': 83, 'width': 15, 'height': 22}]},
        {'id': 'match', 'title': 'Друг принёс железную дорогу', 'kind': 'match', 'narration': 'Друг принёс железную дорогу. Что поедет по рельсам?', 'instruction': 'Выбери игрушку для железной дороги', 'hint': 'У поезда есть колёса. Он может поехать по рельсам.', 'image': f'{ROOT}/match.webp', 'alt': 'Миша и друг собирают деревянную железную дорогу.',
         'options': [option('choose_teddy', 'Мишка', 'teddy', 'Мишка будет пассажиром. А что поедет по рельсам?'), option('choose_train', 'Поезд', 'train', 'Поезд подходит! Возьмём его для нашей игры.', target=True), option('choose_ball', 'Мяч', 'ball', 'Мяч катается по полу. Для рельсов найдём поезд.')], 'hotspots': []},
        {'id': 'request', 'title': 'Иногда нужна помощь', 'kind': 'aac', 'narration': 'Мишка слишком высоко. Поможем Мише попросить помощь?', 'instruction': 'Как попросим маму?', 'hint': 'Подойдёт карточка, жест или помощь взрослого. Говорить вслух не обязательно.', 'image': f'{ROOT}/request.webp', 'alt': 'Миша тянется к высокой полке. Друг смотрит на него с ковра.',
         'options': [option('request_help', 'Помоги', 'help', 'Мама услышала просьбу. Она поможет.', speech='Мама, помоги'), option('request_teddy', 'Дай мишку', 'teddy', 'Мама поняла: Мише нужен мишка.', speech='Мама, дай мишку'), option('request_point', 'Показать на мишку', 'point', 'Миша показал на игрушку. Мама поняла.', speech='Мишка на полке')], 'hotspots': []},
        {'id': 'help', 'title': 'Мама рядом', 'kind': 'help', 'narration': 'Мама достала мишку. Помоги передать его Мише.', 'instruction': 'Нажми на мишку — передадим его Мише', 'hint': 'Мишка между мамой и Мишей. Можно нажать на игрушку или кнопку «Передать мишку».', 'image': f'{ROOT}/help.webp', 'result_image': f'{ROOT}/received.webp', 'alt': 'Мама протягивает мишку Мише. Они рядом на ковре.',
         'options': [option('receive_teddy', 'Передать мишку', 'teddy', 'Мишка у Миши. Как хорошо, когда помогают!', target=True)],
         'hotspots': [{'action': 'receive_teddy', 'x': 53, 'y': 56, 'width': 23, 'height': 36}]},
        {'id': 'play', 'title': 'Поезд отправляется', 'kind': 'sequence', 'narration': 'Миша и друг готовы играть. Возьми поезд и поставь его на рельсы.', 'instruction': 'Сначала возьми поезд', 'hint': 'Сначала нажми на поезд слева. Затем нажми на светлое место на рельсах.', 'image': f'{ROOT}/play.webp', 'alt': 'Миша и друг у деревянной железной дороги. Мишка сидит рядом.',
         'options': [option('pick_train', 'Взять поезд', 'train', 'Поезд у нас. Теперь поставим его на рельсы.'), option('place_train', 'Поставить на рельсы', 'track', 'Поезд поехал! Можно играть вместе.')],
         'hotspots': [{'action': 'pick_train', 'x': 16, 'y': 80, 'width': 24, 'height': 24}, {'action': 'place_train', 'x': 55, 'y': 87, 'width': 28, 'height': 20}]},
        {'id': 'finish', 'title': 'Хорошо играть вместе', 'kind': 'ending', 'narration': 'Миша рад играть с любимой игрушкой. Мама помогла, а друг остался рядом.', 'instruction': 'Можно остаться здесь или закончить книгу', 'hint': 'Мы нашли мишку, попросили помощь и поиграли вместе.', 'image': f'{ROOT}/finish.webp', 'alt': 'Миша, мама и друг спокойно играют с мишкой и поездом.', 'options': [], 'hotspots': []},
    ],
}


# Local demo narration stays replaceable by editorially approved recordings.
_audio_texts = {scene['narration'] for scene in STORY['scenes']}
_audio_texts.update(item['speech'] for scene in STORY['scenes'] for item in scene['options'] if item.get('speech'))
_audio_texts.update(item['feedback'] for scene in STORY['scenes'] for item in scene['options'])
STORY['audio'].update(voice='Milena', source='local_synthesis', clips={text: f"{ROOT}/audio/{sha256(text.encode()).hexdigest()[:12]}.wav" for text in sorted(_audio_texts)})


def initial_state():
    return {'scene_index': 0, 'step': 0, 'ready': False, 'completed': False, 'paused': False,
            'feedback': '', 'selected': None, 'request': None, 'hints': [], 'assisted_scenes': [],
            'break_count': 0, 'refusal_count': 0, 'events': []}


def transition(state, action, event_id):
    result = deepcopy(state)
    scene = STORY['scenes'][state['scene_index']]
    if action == 'restart':
        result = {**initial_state(), 'events': deepcopy(state['events'])}
    elif action in {'pause', 'break', 'refuse', 'resume'}:
        result['paused'] = action != 'resume'
        if action == 'break': result['break_count'] += 1
        if action == 'refuse': result['refusal_count'] += 1
    elif result['paused'] or result['completed']:
        raise ValueError('Сначала продолжите книгу или начните заново')
    elif action == 'hint':
        result['hints'] = sorted(set(result['hints'] + [scene['id']]))
        result['feedback'] = scene['hint']
    elif action == 'assist':
        result['assisted_scenes'] = sorted(set(result['assisted_scenes'] + [scene['id']]))
        result.update(ready=True, step=2 if scene['kind'] == 'sequence' else 1, feedback='Мы помогли вместе. Можно перевернуть страницу.')
        if scene['kind'] == 'aac': result['request'] = 'assisted'
    elif action == 'continue':
        if not result['ready'] and scene['kind'] != 'ending':
            raise ValueError('Сначала помогите Мише или выберите помощь взрослого')
        if scene['kind'] == 'ending': result['completed'] = True
        else: result.update(scene_index=result['scene_index'] + 1, step=0, ready=False, feedback='', selected=None)
    else:
        configured = next((item for item in scene['options'] if item['key'] == action), None)
        if not configured: raise ValueError('Такого действия на этой странице нет')
        if not result['ready']:
            if scene['kind'] == 'sequence':
                if action == 'pick_train' and result['step'] == 0: result['step'] = 1
                elif action == 'place_train' and result['step'] == 1: result.update(step=2, ready=True)
                else: raise ValueError('Сначала возьмите поезд, затем поставьте на рельсы')
            else:
                result['ready'] = scene['kind'] == 'aac' or configured.get('target', False)
                if scene['kind'] == 'aac': result['request'] = action
                if scene['kind'] == 'help': result['step'] = 1
            result['selected'] = action
            result['feedback'] = configured['feedback']
    result['events'].append({'id': event_id, 'action': action, 'scene': scene['id']})
    return result

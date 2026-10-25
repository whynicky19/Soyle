"""One continuous, versioned story; preview observations are never clinical scores."""
from copy import deepcopy

PHASES = ('INTRO', 'NOTICE', 'REACH', 'AWAIT_REQUEST', 'REQUEST', 'MOTHER_ENTER', 'PICK_UP', 'TRANSFER', 'HUG', 'COMPLETE')
DEFINITION = {
    'key': 'toy', 'version': 2, 'schema_version': 2, 'title': 'Миша просит помощь',
    'status': 'PUBLISHED', 'review_status': 'approved', 'phases': list(PHASES),
    'scene_id': 'misha-asks-help', 'scene_count': 1,
    'review_note': 'Опубликовано по решению владельца проекта после технической проверки. Подготовлено AI; это не заключение профильного специалиста.',
    'approval': {'administrator': 'approved'},
    'publication': {'approved_by': 'project_owner', 'date': '2026-10-25', 'model': 'administrator_review'},
    'goal_references': ['functional_communication', 'request_help'],
    'skill_references': ['requesting_assistance', 'multimodal_communication'],
    'measurement_note': 'Участие в истории не подтверждает освоение навыка и не изменяет клиническую оценку.',
    'communication_options': [
        {'action': 'request_help', 'method': 'aac_help', 'label': 'Помоги', 'speech': 'Мама, помоги'},
        {'action': 'request_teddy', 'method': 'aac_teddy', 'label': 'Дай мишку', 'speech': 'Мама, дай мишку'},
        {'action': 'request_point', 'method': 'point', 'label': 'Показать на мишку', 'speech': 'Мишка на полке'},
    ],
    'audio': {'status': 'pending', 'clips': {}, 'fallback': 'device_speech', 'instruction': 'Мише нужна помощь. Поможем попросить?'},
}


def initial_state():
    return {'phase': 'INTRO', 'completed': False, 'paused': False, 'communication_method': None,
            'assistance_count': 0, 'refusal_count': 0, 'break_count': 0, 'hint_count': 0,
            'last_event_id': None, 'events': []}


def transition(state, action, event_id):
    result = deepcopy(state)
    if action == 'restart':
        result = initial_state()
        result['events'] = deepcopy(state['events'])
    elif action in {'pause', 'break', 'refuse', 'resume'}:
        if action == 'refuse' and result['phase'] != 'AWAIT_REQUEST':
            raise ValueError('Отказ доступен при выборе просьбы')
        result['paused'] = action != 'resume'
        if action == 'break': result['break_count'] += 1
        if action == 'refuse': result['refusal_count'] += 1
    elif result['paused'] or result['completed']:
        raise ValueError('Сначала продолжите историю или начните заново')
    elif action == 'hint':
        result['hint_count'] += 1
    elif action in {'request_help', 'request_teddy', 'request_point', 'assist'}:
        if result['phase'] != 'AWAIT_REQUEST':
            raise ValueError('Просьба доступна после попытки достать мишку')
        if action == 'assist': result['assistance_count'] += 1
        else: result['communication_method'] = {'request_help': 'aac_help', 'request_teddy': 'aac_teddy', 'request_point': 'point'}[action]
        result['phase'] = 'REQUEST'
    elif action in {'advance', 'skip'}:
        if result['phase'] == 'AWAIT_REQUEST':
            if action != 'skip': raise ValueError('Выберите способ просьбы, помощь взрослого или перерыв')
            result['assistance_count'] += 1
        result['phase'] = PHASES[PHASES.index(result['phase']) + 1]
        result['completed'] = result['phase'] == 'COMPLETE'
    else:
        raise ValueError('Неизвестное действие истории')
    result['last_event_id'] = event_id
    # Retain event identities for delayed network retries, and descriptive observations separately.
    result['events'].append({'id': event_id, 'action': action, 'phase': result['phase']})
    return result

"""Structural contracts for sorting, ordered stories and one-to-one matching."""
import re

VARIED_MECHANICS = frozenset({'category_sort', 'action_sequence', 'object_match'})


def validate_varied(version):
    errors = []
    content = version.get('content') or {}
    mechanic = version['mechanic']
    registry = {item.get('media_ref') for item in content.get('asset_registry', []) if isinstance(item, dict)}

    def cards(items, name, minimum, maximum):
        if not isinstance(items, list) or not minimum <= len(items) <= maximum:
            errors.append(f'{name}: допустимо от {minimum} до {maximum} картинок')
            return set()
        keys = []
        for item in items:
            if not isinstance(item, dict):
                errors.append(f'{name}: неверная карточка')
                continue
            key, path = item.get('key', ''), item.get('media_ref', '')
            if not isinstance(key, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,49}', key):
                errors.append(f'{name}: нужен стабильный ключ карточки')
            if not item.get('label') or not isinstance(path, str) or not path.startswith('/') or path.startswith('//') or '..' in path:
                errors.append(f'{name}: нужны подпись и локальное изображение')
            if path not in registry:
                errors.append(f'{name}: изображение отсутствует в реестре ресурсов')
            keys.append(key)
        if len(set(keys)) != len(keys):
            errors.append(f'{name}: повторяющиеся ключи')
        return set(keys)

    if version.get('response_mode') != 'tap_sequence':
        errors.append('Для этой механики нужен последовательный выбор tap_sequence')
    if mechanic == 'category_sort':
        groups = cards(content.get('categories'), 'Группы', 2, 4)
        items = content.get('sort_items')
        cards(items, 'Предметы сортировки', 6, 60)
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and item.get('category_key') not in groups:
                    errors.append('У предмета указана неизвестная группа')
            if any(sum(isinstance(item, dict) and item.get('category_key') == key for item in items) < 2 for key in groups):
                errors.append('В каждой группе нужны хотя бы два предмета')
        count = len(items) if isinstance(items, list) else 0
    else:
        tasks = content.get('tasks')
        if not isinstance(tasks, list) or not 1 <= len(tasks) <= 60:
            return errors + ['Нужен непустой банк заданий, максимум 60']
        task_keys = []
        for task in tasks:
            if not isinstance(task, dict):
                errors.append('Неверный формат задания')
                continue
            task_keys.append(task.get('key'))
            if not task.get('key') or not task.get('instruction'):
                errors.append('У задания нужны ключ и инструкция')
            keys = cards(task.get('cards'), 'Карточки задания', 2, 6)
            if mechanic == 'action_sequence':
                order = task.get('correct_order')
                if not isinstance(order, list) or not 2 <= len(order) <= 4 or len(set(order)) != len(order) or not set(order).issubset(keys):
                    errors.append('Порядок должен содержать 2–4 уникальных ключа показанных карточек')
                elif len(keys) != len(order) + 1:
                    errors.append('Для последовательности нужна ровно одна лишняя карточка')
            else:
                targets = cards(task.get('targets'), 'Сцены для пар', 2, 6)
                pairs = task.get('pairs')
                if not isinstance(pairs, list) or len(pairs) != len(keys) or len(pairs) != len(targets):
                    errors.append('Каждой карточке нужна ровно одна пара')
                elif ({pair.get('object_key') for pair in pairs if isinstance(pair, dict)} != keys
                      or {pair.get('target_key') for pair in pairs if isinstance(pair, dict)} != targets):
                    errors.append('Пары должны однозначно связывать все предметы и все сцены')
        if len(set(task_keys)) != len(task_keys):
            errors.append('Ключи заданий не должны повторяться')
        count = len(tasks)
    choices = content.get('round_choices')
    default = content.get('default_rounds')
    if not isinstance(choices, list) or not choices or len(set(choices)) != len(choices) or any(type(n) is not int or not 1 <= n <= count for n in choices):
        errors.append('Длина серии должна входить в размер банка без повторов')
    if type(default) is not int or not choices or default not in choices:
        errors.append('Нужна допустимая длина серии по умолчанию')
    return errors

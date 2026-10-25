"""Independent picture descriptions, deliberately separate from stories."""
import json
from pathlib import Path

SCENES = json.loads(Path(__file__).with_name('observation_scenes.json').read_text())
OBSERVATION_GOAL = {
    'key': 'describe-picture', 'title': 'Составлять описание картинки', 'skill_category': 'phrase_building',
    'observable_behavior': 'Выбирает персонажа и постепенно добавляет действие и подробность по отдельному рисунку.',
    'baseline_prompt': 'Отметьте доступную длину сообщения и необходимую поддержку.',
    'target_outcome': 'Составляет доступное описание отдельной картинки; поддержка и длина фразы отмечаются отдельно.',
    'accepted_responses': ['выбор озвучиваемых слов', 'указание или взгляд с подтверждением взрослого'],
    'default_help_level': 'minimal', 'matching_targets': ['observation'], 'matching_mechanics': ['guided_aac'],
}
OBSERVATION_CONTENT = {
    'presentation': 'picture_description', 'scenario_key': 'observation',
    'bank_key': 'observation-pictures-v3', 'title': 'Я вижу: опиши картинку',
    'instruction': 'Рассмотри картинку. Собери полную фразу: кто на ней, что делает и с чем или где. Например: «Папа запускает воздушного змея».',
    'default_rounds': 12, 'round_choices': [12, 18, 24], 'max_rounds': 24,
    'scenes': SCENES,
    'asset_registry': [{'media_ref': s['media_ref'], 'origin': 'OpenAI image generation, 2026-10-25',
        'license': 'Generated for Soyle', 'license_status': 'documented'} for s in SCENES],
}
OBSERVATION_SPEECH = {'Кто на картинке?', 'Что делает?', 'Где?', 'Как?', 'Что?',
    'Рассмотри картинку. Кто на ней?', 'Посмотри ещё раз. Можно послушать слова или посмотреть образец.'}
for scene in SCENES:
    actor = scene['parts'][0].lower()
    OBSERVATION_SPEECH.add(f'Что делает {actor}?')
    OBSERVATION_SPEECH.add(scene['detail_question'][:-1] + f' {actor}?')
    OBSERVATION_SPEECH.add(scene['detail_question'])
    OBSERVATION_SPEECH.update(word for group in scene['options'] for word in group)
    for length in (1, 2, 3):
        OBSERVATION_SPEECH.add(' '.join(scene['parts'][:length]))


def observation_method_card():
    from .p15_content import _method_card
    card = _method_card(target_skill='Описывать отдельную картинку: персонаж, действие, подробность',
        skill_group=['Составление фразы по изображению'], child_instruction=OBSERVATION_CONTENT['instruction'],
        stimuli_and_responses='24 самостоятельных рисунка, 6 тем. Три последовательных выбора, по три озвучиваемых варианта на каждом шаге. Серии 12, 18 или 24.',
        prerequisites=['Рассматривает отдельную картинку', 'Может выбрать слово касанием, указанием или с поддержкой взрослого'],
        adult_guidance=['Каждая картинка завершается полной фразой из трёх частей: персонаж, действие, предмет или место', 'Дайте время рассмотреть рисунок. При необходимости прослушайте варианты', 'Не торопите ребёнка: выбирайте части по одной; при затруднении предложите образец, перерыв или завершение без оценки', 'Показ образца сохраняется отдельно от ответа ребёнка'],
        accepted_responses=['Три выбранные части полного описания; незавершённые ответы сохраняются отдельно', 'Указание или взгляд с подтверждением взрослого', 'Отказ и перерыв принимаются без оценки'],
        ambiguities=['Названия мама и папа обозначают условных персонажей, а не родственников ребёнка', 'Выбор из вариантов не доказывает самостоятельный рассказ или перенос в жизнь'],
        transfer=['Предложите описать одну реальную фотографию или знакомое действие в жизни'],
        result_rules=['Сохраняется участие без балла правильности', 'По каждой картинке: собранная фраза, длина, выборы, исправления, прослушивание слов и образец', 'Спонтанная инициатива не приписывается ответу на вопрос', 'Незавершённое описание при перерыве сохраняется отдельно'])
    card.update(difficulty_levels=['На каждой картинке: персонаж → действие → предмет или место. Один выбор за шаг; переход только после полной фразы'],
        prompts=['Прослушать слово', 'Повторить вопрос', 'Показать образец'],
        evidence_note='Описание механики продукта. Клиническая эффективность и независимая экспертная проверка не заявлены.')
    return card


def validate_observation(content):
    errors = []
    scenes = content.get('scenes')
    if not isinstance(scenes, list) or len(scenes) < 24:
        return ['Для описания картинок нужно не менее 24 сцен']
    keys, media, themes = set(), set(), set()
    for scene in scenes:
        if not isinstance(scene, dict):
            errors.append('Сцена должна быть объектом'); continue
        key, path, parts, groups = (scene.get(field) for field in ('key', 'media_ref', 'parts', 'options'))
        if not key or key in keys: errors.append('Ключи сцен должны быть уникальными')
        if not isinstance(path, str) or not path.startswith('/learning-observation/') or '..' in path or path in media:
            errors.append('Каждой сцене нужен собственный локальный рисунок')
        keys.add(key); media.add(path); themes.add(scene.get('theme'))
        if not isinstance(parts, list) or len(parts) != 3 or any(not isinstance(p, str) or not p.strip() for p in parts):
            errors.append('В каждой сцене нужны три части фразы'); continue
        if not isinstance(groups, list) or len(groups) != 3 or any(
            not isinstance(group, list) or len(group) < 3 or any(not isinstance(w, str) or not w.strip() for w in group)
            or len(group) != len(set(group)) or part not in group for part, group in zip(parts, groups)):
            errors.append('Для каждого шага нужны ответ и два разных отвлекающих варианта')
    if len(themes) < 6: errors.append('Нужно не менее шести тематик')
    registry = {asset.get('media_ref') for asset in content.get('asset_registry', []) if isinstance(asset, dict)}
    if not media.issubset(registry): errors.append('Все рисунки должны быть внесены в реестр материалов')
    if content.get('default_rounds') not in (12, 18, 24) or content.get('round_choices') != [12, 18, 24]:
        errors.append('Доступны серии из 12, 18 и 24 картинок')
    return errors

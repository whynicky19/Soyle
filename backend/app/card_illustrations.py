"""Raster replacements for learning cards; old version payloads stay archived."""
from copy import deepcopy

CARD_MEDIA = {}
for group, keys in {
    'toys': ('blocks', 'doll', 'toy-car', 'puzzle', 'drum'),
    'food': ('apple', 'banana', 'bread', 'juice', 'water', 'soup'),
    'animals': ('cat', 'dog', 'rabbit', 'bird', 'fish', 'turtle'),
}.items():
    for key in keys:
        CARD_MEDIA[f'/p15/nouns/{group}/{key}.svg'] = f'/app-illustrations/exercise-stimulus-{key}.webp'
for key in ('ball', 'book', 'cup', 'spoon'):
    group = 'toys' if key == 'ball' else 'home'
    CARD_MEDIA[f'/p15/nouns/{group}/{key}.svg'] = f'/learning-core/words/{key}-a.webp'
for group, keys in {
    'clothing': ('shirt', 'trousers', 'dress', 'shoes', 'hat', 'jacket'),
    'home': ('chair', 'bed', 'lamp'),
    'body': ('hand', 'foot', 'nose', 'ear', 'eyes', 'mouth'),
}.items():
    for key in keys:
        CARD_MEDIA[f'/p15/nouns/{group}/{key}.svg'] = f'/learning-cards/{key}.png'
for key in ('adult', 'box', 'bear'):
    CARD_MEDIA[f'/p1/objects/{key}.svg'] = f'/learning-cards/{key}.png'
for key in ('hand', 'table'):
    CARD_MEDIA[f'/p15/objects/{key}.svg'] = f'/learning-cards/{key}.png'
for key in ('eat', 'drink', 'play'):
    CARD_MEDIA[f'/p1/actions/{key}.svg'] = f'/learning-core/actions/{key}.webp'
for key in ('sleep', 'run'):
    CARD_MEDIA[f'/p1/actions/{key}.svg'] = f'/learning-cards/{key}.png'
for key in ('walk', 'sit', 'stand', 'wash'):
    CARD_MEDIA[f'/p15/actions/{key}.svg'] = f'/learning-cards/{key}.png'
CARD_MEDIA['/p15/actions/read.svg'] = '/learning-core/actions/read.webp'
for key in ('cat', 'dog', 'rabbit', 'bird', 'fish', 'turtle', 'snail', 'bug',
            'ball', 'toy-car', 'blocks', 'doll', 'book', 'puzzle', 'paint', 'drum',
            'apple', 'banana', 'bread', 'milk', 'juice', 'water', 'soup', 'porridge'):
    CARD_MEDIA[f'/aac-pictograms/{key}.png'] = f'/app-illustrations/exercise-stimulus-{key}.webp'


def illustrated_content(content):
    def replace(value):
        if isinstance(value, str):
            return CARD_MEDIA.get(value, value)
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            result = {key: replace(item) for key, item in value.items()}
            if value.get('media_ref') in CARD_MEDIA and 'origin' in value:
                result['origin'] = 'Сгенерированная растровая учебная иллюстрация Söyle'
                result['license'] = 'Синтетический проектный ресурс Söyle'
            return result
        return value
    updated = replace(deepcopy(content))
    for scenario in updated.get('scenarios', []):
        obj = scenario.get('success', {}).get('object_key')
        target = scenario.get('success', {}).get('target_key')
        if scenario.get('result') and obj in ('ball', 'book') and target in ('box', 'table', 'bear', 'adult'):
            scenario['result']['media_ref'] = f'/learning-cards/results/{obj}-{target}.png'
            registry = updated.setdefault('asset_registry', [])
            if not any(item['media_ref'] == scenario['result']['media_ref'] for item in registry):
                registry.append({'media_ref': scenario['result']['media_ref'], 'origin': 'Сцена результата; встроенный imagegen', 'license': 'Синтетический проектный ресурс Söyle', 'license_status': 'documented'})
    if updated != content:
        revision = str(content.get('revision', 'legacy'))
        updated['revision'] = revision if revision.endswith('-raster-r1') else revision + '-raster-r1'
    return updated

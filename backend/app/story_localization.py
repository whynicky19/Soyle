"""Static Kazakh adaptation, explicitly awaiting specialist review."""
import copy
import json
from pathlib import Path
from fastapi import HTTPException
from .localization import LOCALE

FIELDS = {'title','subtitle','narration','instruction','hint','alt','label','feedback','speech','measurement_note','home_transfer','summary','age_note','reaction','assisted_reaction'}

def story_adaptation(key, version=None):
    filename = {("toy",3):"kk-KZ-favorite-toy.json", ("toy",1):"kk-KZ-living-toy.json", ("toy",2):"kk-KZ-cinematic-toy.json", ("picnic",1):"kk-KZ-picnic.json"}.get((key, version if version is not None else (3 if key == "toy" else 1)))
    if not filename: raise HTTPException(404,"translation.source_missing")
    return json.loads((Path(__file__).parent/"locales"/filename).read_text())


def toy_adaptation():
    return story_adaptation("toy")

def localize_story_snapshot(snapshot):
    if LOCALE.get() != 'kk-KZ': return snapshot
    adaptation = story_adaptation(snapshot["definition"]["key"], snapshot["definition"]["version"])
    if snapshot['definition']['version'] != adaptation['source_version']:
        raise HTTPException(409,'translation.source_changed')
    if not snapshot['preview']:
        raise HTTPException(403,'translation.needs_specialist_review')
    def visit(value, field=''):
        if isinstance(value,dict): return {key:visit(item,"narration" if field == "narrations" else key) for key,item in value.items()}
        if isinstance(value,list): return [visit(item,field) for item in value]
        if isinstance(value,str) and field in FIELDS and value:
            translated = adaptation['texts'].get(value)
            if translated is None: raise HTTPException(409,'translation.incomplete')
            return translated
        return value
    result = copy.deepcopy(snapshot)
    # The source publication does not approve its translated adaptation.
    result['definition'] = visit(snapshot['definition'])
    result['definition'].update(language='kk',status='DRAFT',review_status='needs_review',approval={},publication={},
        review_note='Қазақша аударма маманның әдістемелік тексеруін күтуде.',audio={'status':'tts_preview','clips':{}})
    for scene in result['definition'].get('scenes', []):
        if 'status' in scene: scene.update(status='DRAFT', review_status='needs_review')
    if snapshot['definition']['version'] == 2 and snapshot['definition']['key'] == 'toy':
        result['definition']['narration_translations'] = adaptation['texts']
    result['state'] = visit(snapshot['state'])
    return result


# Backward-compatible name for existing callers.
localize_toy_snapshot = localize_story_snapshot


def localize_story_catalogue(catalogue, role):
    if LOCALE.get() != 'kk-KZ': return catalogue
    # None of the Kazakh adaptations has received specialist approval.
    if role != 'parent': return []
    sources={'toy':('toy',3),'picnic':('picnic',1),'living-toy':('toy',1),'misha-help':('toy',2)}
    result=[]
    for original in catalogue:
        source=sources.get(original['key'])
        if not source: continue
        adaptation=story_adaptation(*source)
        texts=adaptation['texts']
        title=texts.get(original['title'])
        summary=texts.get(original['summary'])
        if not title or not summary: raise HTTPException(409,'translation.incomplete')
        item=copy.deepcopy(original)
        item.update(title=title,summary=summary,language='kk',translation_status='needs_review',preview=True,
            category='Таңдау және көмек' if original.get('category')=='Выбор и помощь' else 'Жанды әңгімелер')
        if original.get('progress_label'):
            item['progress_label']='Әңгіме оқылды' if original.get('completed_at') else f"{item['scene_count']} көріністің {item['scene_index']}-і"
        result.append(item)
    return result

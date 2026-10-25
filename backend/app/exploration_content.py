"""Versioned search scenes. New material always enters the existing DRAFT workflow."""
import json
import math
import re
from pathlib import Path
from .p15_content import _method_card

LOCATIONS = json.loads(Path(__file__).with_name('exploration_locations.json').read_text())
OBJECT_GOAL_TARGETS = ['animals','food','toys','body','clothes','household','p15-nouns-animals','p15-nouns-food','p15-nouns-toys','p15-nouns-body','p15-nouns-clothing','p15-nouns-home']
EXPLORATION_GOAL = dict(key='understand-words-in-scenes',title='Находить названные предметы в разных ситуациях',skill_category='object_understanding',
    observable_behavior='Находит названный предмет на цельной сцене или среди отдельных картинок; помощь и контекст фиксируются отдельно.',
    baseline_prompt='Какие слова ребёнок узнаёт на картинках и в комнате? Отметьте необходимую поддержку.',
    target_outcome='Находит знакомые предметы по обращённой инструкции в двух доступных игровых форматах.',
    accepted_responses=['нажатие на предмет','клавиатура','указание с подтверждением взрослого'],default_help_level='minimal',
    matching_targets=[*OBJECT_GOAL_TARGETS,*['explore-'+s['key'] for s in LOCATIONS]],matching_mechanics=['auditory_choice','scene_search'])


def point_in_polygon(point, polygon, *, boundary=True):
    x,y=point;inside=False
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0])
        if abs(cross)<1e-9 and min(a[0],b[0])-1e-9<=x<=max(a[0],b[0])+1e-9 and min(a[1],b[1])-1e-9<=y<=max(a[1],b[1])+1e-9:
            return boundary
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
    return inside


def hit_object(scene, point):
    return next((obj for obj in scene['objects'] if any(point_in_polygon(point,p) for p in obj['hit_polygons'])),None)


def polygons_overlap(first,second):
    if {tuple(p) for p in first}=={tuple(p) for p in second}:return True
    for polygon in (first,second):
        center=[sum(p[i] for p in polygon)/len(polygon) for i in (0,1)]
        if point_in_polygon(center,first,boundary=False) and point_in_polygon(center,second,boundary=False):return True
    def orient(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    for a,b in zip(first,first[1:]+first[:1]):
        for c,d in zip(second,second[1:]+second[:1]):
            if orient(a,b,c)*orient(a,b,d)<-1e-12 and orient(c,d,a)*orient(c,d,b)<-1e-12:return True
    return any(point_in_polygon(p,second,boundary=False) for p in first) or any(point_in_polygon(p,first,boundary=False) for p in second)


def validate_exploration(content):
    scene=content.get('exploration') or {};errors=[]
    image=scene.get('image') or {};objects=scene.get('objects') or []
    if not scene.get('key') or not scene.get('title'):errors.append('У локации нужны стабильный ключ и название')
    if not str(image.get('media_ref','')).startswith('/explore-world/') or '..' in image.get('media_ref','') or not re.fullmatch('[a-f0-9]{64}',image.get('sha256','')) or not image.get('version') or not 1<=image.get('width',0)<=8192 or not 1<=image.get('height',0)<=8192:
        errors.append('Изображению нужны локальный путь, версия, размеры и SHA-256')
    if not 10<=len(objects)<=12:errors.append('В локации должны быть 10–12 целевых предметов')
    if len({o.get('id') for o in objects})!=len(objects) or len({o.get('concept_id') for o in objects})!=len(objects):errors.append('ID предметов и словарных понятий не должны повторяться')
    valid=[]
    for obj in objects:
        polygons=obj.get('hit_polygons') or []
        good=bool(polygons) and all(isinstance(p,list) and 3<=len(p)<=60 and all(isinstance(v,list) and len(v)==2 and all(type(c) in (int,float) and math.isfinite(c) and 0<=c<=1 for c in v) for v in p) for p in polygons)
        if not good:errors.append(f"{obj.get('id')}: неверный нормализованный полигон");continue
        valid.append(obj)
        point=obj.get('hit_point') or []
        if len(point)!=2 or not any(point_in_polygon(point,p) for p in polygons):errors.append(f"{obj['id']}: контрольная точка вне предмета")
        regions=obj.get('hint_regions') or []
        if len(regions)!=2 or any(len(r)!=4 or any(not 0<=c<=1 for c in r) or r[2]<=0 or r[3]<=0 or r[0]+r[2]>1.0001 or r[1]+r[3]>1.0001 or not (r[0]<=point[0]<=r[0]+r[2] and r[1]<=point[1]<=r[1]+r[3]) for r in regions):errors.append(f"{obj['id']}: подсказки должны содержать предмет")
        if any(key not in {o.get('id') for o in objects} or key==obj['id'] for key in obj.get('related_surfaces',[])) or obj.get('related_surfaces') and not obj.get('part_feedback'):errors.append('Для связанных поверхностей нужны существующие предметы и нейтральное уточнение')
        if not obj.get('label') or not obj.get('concept_id') or set(obj.get('instructions',{}))!={'1','2','3'} or any(not str(v).strip() for v in obj.get('instructions',{}).values()):errors.append(f"{obj['id']}: нужны название и три проверенные инструкции")
    for i,obj in enumerate(valid):
        for other in valid[i+1:]:
            if any(polygons_overlap(a,b) for a in obj['hit_polygons'] for b in other['hit_polygons']):errors.append(f"Зоны пересекаются: {obj['id']} / {other['id']}")
    if sum(bool(o.get('beginner')) for o in objects)<4:errors.append('Нужны хотя бы четыре крупные цели для начального уровня')
    if content.get('round_choices')!=[4,8,12] or content.get('default_rounds')!=4:errors.append('Для поиска доступны короткие серии 4, 8 и 12')
    return errors


def draft_for_location(scene):
    instruction='Послушай название и найди предмет на рисунке. Можно увеличить сцену, повторить вопрос или попросить подсказку.'
    method=_method_card(target_skill='Находить названный предмет на цельной иллюстрации',skill_group=['Понимание слов','Понимание обращённой речи'],child_instruction=instruction,
        stimuli_and_responses='12 предметов в одной цельной сцене. Серии 4, 8 или 12; нет ограничения времени. Касание предмета или клавиатура.',
        prerequisites=['Может рассмотреть изображение и выбрать предмет доступным способом'],
        adult_guidance=['Первый запуск озвучки — по кнопке ребёнка','Не называйте ответ вместо ребёнка; помощь и режим озвучивания всех предметов отмечаются отдельно','На начальном уровне инструкция короче и цели крупнее, но на картинке остаются все 12 предметов','Подсказка сначала указывает широкую область; повторная — более узкую область'],
        accepted_responses=['Касание предмета на сцене','Tab и Enter или пробел','Доступный режим с названиями предметов: участие без оценки'],
        ambiguities=['Зоны должны быть повторно проверены после любой смены иллюстрации','Поиск в сцене и выбор отдельной картинки — разные условия; их точность не объединяется в один показатель'],
        transfer=['Найдите этот предмет в знакомой комнате; бытовое наблюдение фиксируется отдельно'],
        result_rules=['Результат рассчитывается сервером по журналу событий','Перерыв, отказ, техническая ошибка и касания пустого места не считаются ошибкой понимания','Подсказки, повтор речи и исправления исключают полностью самостоятельный ответ','Повторение слова назначается по нескольким наблюдениям, а не по одному промаху'])
    method.update(difficulty_levels=['Короткое название и крупные цели; сцена содержит 12 предметов','Поиск по простой инструкции среди всех предметов','Заранее подготовленные признаки и пространственные отношения'],prompts=['Повтор инструкции','Широкая область','Более точная область'],sources=[],evidence_note='Механика продукта; независимая методическая экспертиза и клиническая эффективность не заявлены.')
    return dict(module='sensory',title='Исследуй мир: '+scene['title'],target='explore-'+scene['key'],mechanic='scene_search',objective='Находить названные предметы на иллюстрированной сцене и отдельно учитывать поддержку.',instruction=instruction,difficulty=1,skill='speech_comprehension',language='ru',response_mode='single_tap',
        prompt_policy={'steps':['repeat_audio','broad_region','focused_region'],'time_limit':None},completion_rule={'success':'server_verified_scene_search','rounds':4,'refusal_is_valid':True},
        content={'exploration':scene,'bank_key':'explore-'+scene['key']+'-v1','default_rounds':4,'round_choices':[4,8,12],'max_rounds':12,'asset_registry':[dict(media_ref=scene['image']['media_ref'],origin='OpenAI image generation, 2026-10-25',license='Generated for Soyle',license_status='documented')]},method_card=method)


EXPLORATION_SPEECH = {"Давай попробуем ещё раз."}
for scene in LOCATIONS:
    for obj in scene["objects"]:
        EXPLORATION_SPEECH.update(obj["instructions"].values())
        if obj.get('part_feedback'):EXPLORATION_SPEECH.add(obj['part_feedback'])
        EXPLORATION_SPEECH.add("Да, это "+obj["label"].lower()+"!")

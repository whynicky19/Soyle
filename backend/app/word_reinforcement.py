"""Reviewed-authoring inputs for isolated words that transfer back to search scenes.

Migration 35 creates DRAFTs. Publication is the existing explicit admin action.
"""
from .exploration_content import LOCATIONS
from .p15_content import _method_card

REVISION = 'scene-word-reinforcement-2026-10-26-v1'
ROOT = '/word-reinforcement'
TARGETS = ['scene-words-'+scene['key'] for scene in LOCATIONS]
REUSED_IMAGES = {
    'bed':'/learning-cards/bed.png',
    'blocks':'/app-illustrations/exercise-stimulus-blocks.webp',
    'apple':'/app-illustrations/exercise-stimulus-apple.webp',
    'banana':'/app-illustrations/exercise-stimulus-banana.webp',
    'carrot':'/learning-expanded/food/carrot.webp',
    'bread':'/app-illustrations/exercise-stimulus-bread.webp',
    'plate':'/learning-expanded/home/plate.webp',
    'spoon':'/learning-core/words/spoon-a.webp',
    'cup':'/learning-core/words/cup-a.webp',
    'basket':'/learning-expanded/home/basket.webp',
    'kite':'/learning-expanded/toys/kite.webp',
}
HINTS = {
    'bed':'На ней лежат, когда спят.',
    'pillow':'На неё кладут голову, когда ложатся спать.',
    'blanket':'Им укрываются, когда спят.',
    'slippers':'Мягкая обувь для дома. Найди пару.',
    'pajamas':'Одежда для сна: кофта и штаны.',
    'alarm-clock':'Часы со звонком, который помогает проснуться.',
    'wardrobe':'Мебель с дверцами, внутри которой хранят одежду.',
    'curtain':'Ткань, которой закрывают окно.',
    'night-light':'Лампа, которая мягко светит ночью.',
    'dinosaur':'Игрушка в виде большого древнего животного с длинным хвостом.',
    'mirror':'В нём можно увидеть своё отражение.',
    'blocks':'Из этих игрушечных деталей можно построить башню.',
    'apple':'Круглый фрукт с коротким хвостиком.',
    'banana':'Длинный изогнутый фрукт в кожуре.',
    'carrot':'Длинный овощ с зелёным хвостиком.',
    'bread':'Его пекут из теста и режут на ломтики.',
    'plate':'Плоская посуда, в которую кладут еду.',
    'spoon':'Ею едят суп или кашу.',
    'cup':'Посуда с ручкой, из которой пьют.',
    'kettle':'В нём нагревают воду. У него есть ручка и носик.',
    'pot':'В ней варят суп на плите. У неё две короткие ручки.',
    'refrigerator':'В нём продукты остаются холодными.',
    'sink':'В ней моют посуду. Над ней есть кран.',
    'napkin':'Ею вытирают руки или рот во время еды.',
    'sofa':'Мягкая мебель с длинным сиденьем для нескольких человек.',
    'armchair':'Мягкая мебель с подлокотниками для одного человека.',
    'television':'На его экране смотрят передачи и мультфильмы.',
    'remote':'Им переключают передачи. На нём много кнопок.',
    'floor-lamp':'Высокая лампа на длинной ножке, которая стоит на полу.',
    'carpet':'Мягкое покрытие, которое кладут на пол.',
    'painting':'Рисунок в рамке, который вешают на стену.',
    'vase':'В неё можно поставить срезанные цветы.',
    'basket':'Плетёная ёмкость, в которую складывают вещи.',
    'aquarium':'Прозрачный дом с водой, в котором живут рыбки.',
    'guitar':'Музыкальный инструмент со струнами и длинным грифом.',
    'board-game':'Игра с полем, фишками и кубиком, в которую играют за столом.',
    'slide':'На неё поднимаются по лесенке, а потом съезжают вниз.',
    'swing':'Сиденье на верёвках, на котором качаются вперёд и назад.',
    'sandbox':'Невысокий деревянный бортик с песком внутри.',
    'bucket':'В него набирают песок. У него есть ручка сверху.',
    'shovel':'Ею копают и набирают песок.',
    'bicycle':'У него два колеса, руль, сиденье и педали.',
    'kite':'Игрушка, которая летит на ветру на длинной нитке.',
    'bench':'Длинное сиденье со спинкой, на котором отдыхают на улице.',
    'watering-can':'Из неё поливают растения. У неё длинный носик.',
    'birdhouse':'Маленький деревянный домик с круглым входом для птицы.',
    'flower':'Растение со стеблем, листьями и лепестками.',
    'butterfly':'Насекомое с четырьмя широкими крыльями и усиками.',
}
# Authored contrast pools vary across questions. Part/whole alternatives are
# excluded where the larger illustration also visibly contains the target.
CONTRASTS = {
    'bed':['wardrobe','curtain','mirror','slippers','pajamas','dinosaur'],
    'pillow':['blanket','slippers','pajamas','night-light','blocks','mirror'],
    'blanket':['pillow','slippers','pajamas','night-light','blocks','curtain'],
    'slippers':['pajamas','pillow','blanket','curtain','dinosaur','alarm-clock'],
    'pajamas':['slippers','pillow','blanket','curtain','blocks','mirror'],
    'alarm-clock':['night-light','mirror','blocks','dinosaur','wardrobe','slippers'],
    'wardrobe':['bed','mirror','curtain','night-light','alarm-clock','pajamas'],
    'curtain':['blanket','pajamas','mirror','wardrobe','bed','pillow'],
    'night-light':['alarm-clock','mirror','dinosaur','blocks','wardrobe','pillow'],
    'dinosaur':['blocks','night-light','alarm-clock','slippers','pajamas','mirror'],
    'mirror':['wardrobe','curtain','alarm-clock','night-light','bed','blocks'],
    'blocks':['dinosaur','alarm-clock','night-light','slippers','pajamas','mirror'],
    'apple':['banana','carrot','bread','cup','plate','napkin'],
    'banana':['apple','carrot','bread','spoon','plate','napkin'],
    'carrot':['banana','apple','bread','spoon','napkin','cup'],
    'bread':['apple','banana','carrot','plate','napkin','pot'],
    'plate':['cup','pot','kettle','spoon','napkin','sink'],
    'spoon':['cup','plate','pot','kettle','napkin','carrot'],
    'cup':['kettle','pot','plate','spoon','sink','napkin'],
    'kettle':['pot','cup','sink','refrigerator','plate','spoon'],
    'pot':['kettle','cup','plate','sink','refrigerator','bread'],
    'refrigerator':['sink','pot','kettle','cup','plate','bread'],
    'sink':['pot','kettle','plate','cup','refrigerator','spoon'],
    'napkin':['plate','spoon','cup','bread','apple','carrot'],
    'sofa':['armchair','carpet','floor-lamp','basket','television','guitar'],
    'armchair':['sofa','carpet','floor-lamp','basket','television','vase'],
    'television':['painting','aquarium','board-game','remote','floor-lamp','sofa'],
    'remote':['television','board-game','guitar','floor-lamp','vase','basket'],
    'floor-lamp':['vase','guitar','armchair','sofa','television','basket'],
    'carpet':['painting','board-game','sofa','armchair','basket','aquarium'],
    'painting':['television','aquarium','board-game','carpet','guitar','vase'],
    'vase':['basket','aquarium','floor-lamp','guitar','armchair','remote'],
    'basket':['vase','aquarium','carpet','board-game','armchair','remote'],
    'aquarium':['television','vase','basket','painting','board-game','sofa'],
    'guitar':['floor-lamp','board-game','vase','remote','basket','armchair'],
    'board-game':['carpet','painting','remote','guitar','aquarium','television'],
    'slide':['swing','sandbox','bicycle','bench','birdhouse','kite'],
    'swing':['slide','bench','bicycle','sandbox','kite','birdhouse'],
    'sandbox':['bucket','watering-can','bench','slide','swing','bicycle'],
    'bucket':['watering-can','shovel','sandbox','birdhouse','bicycle','kite'],
    'shovel':['watering-can','bucket','bicycle','kite','bench','birdhouse'],
    'bicycle':['swing','slide','bench','kite','watering-can','sandbox'],
    'kite':['butterfly','birdhouse','bicycle','shovel','slide','swing'],
    'bench':['swing','slide','sandbox','bicycle','birdhouse','watering-can'],
    'watering-can':['bucket','shovel','bicycle','birdhouse','bench','sandbox'],
    'birdhouse':['sandbox','bench','watering-can','kite','slide','bucket'],
    'flower':['butterfly','birdhouse','kite','watering-can','bucket','shovel'],
    'butterfly':['flower','kite','birdhouse','shovel','bucket','watering-can'],
}


def make_bank(scene):
    stimuli=[]
    for obj in scene['objects']:
        key=obj['concept_id']
        stimuli.append(dict(key=key,label=obj['label'],speech=obj['label'],word_concept_id=key,
            media_ref=REUSED_IMAGES.get(key,f'{ROOT}/{key}-v1.webp'),hint=HINTS[key],distractor_keys=CONTRASTS[key]))
    method=_method_card(target_skill='Узнавать названные предметы по отдельным изображениям и переносить узнавание в цельную сцену',
        skill_group=['Понимание слов','Перенос между изображением и сценой'],child_instruction='Послушай слово и покажи картинку.',
        stimuli_and_responses='12 разных слов. Серии 6, 12, 18 или 24; по умолчанию каждое слово предъявляется один раз за 12 вопросов. Два, три или четыре варианта. Варианты подбираются из авторского списка, положение ответа меняется.',
        adult_guidance=['Дайте время рассмотреть картинки; ограничения времени нет','До ответа подписи скрыты. Не называйте правильную карточку вместо ребёнка','Повтор, смысловая подсказка, сокращение выбора и показ образца фиксируются отдельно','Для повторения достаточно короткой серии из плана. Говорить вслух не обязательно'],
        ambiguities=['Одна отдельная картинка не подтверждает узнавание реального предмета; возвращение в сцену проверяется отдельно','Для подушки и одеяла исключена картинка кровати с этими же предметами','Цвет и расположение не являются единственным критерием ответа; узнавание других изображений пока не проверяется'],
        transfer=['После нескольких самостоятельных карточных практик предложить это же понятие в исходной локации','Один промах, отказ, перерыв или техническая ошибка не означают незнания слова'],
        result_rules=['Сохранять выбранный ключ, первый ответ, показанные картинки, помощь и исход каждого раунда','Учитывать разные сессии: повторы одного слова внутри серии не заменяют несколько наблюдений','Не считать подсказанный или показанный ответ самостоятельным','Предпросмотр взрослого не записывать в историю ребёнка'])
    method.update(sources=[],evidence_note='Авторский материал продукта. Связь с локациями технически проверяется; независимая клиническая эффективность не заявляется.')
    paths=sorted({s['media_ref'] for s in stimuli})
    return dict(module='sensory',target='scene-words-'+scene['key'],title='Слова из локации: '+scene['title'],
        mechanic='auditory_choice',objective='Узнавать 12 названий предметов из локации по отдельным картинкам с раздельным учётом помощи.',
        instruction='Послушай слово и покажи картинку.',difficulty=1,skill='speech_comprehension',language='ru',response_mode='single_tap',
        prompt_policy={'steps':['repeat_audio','visual_hint','reduced_choice','model_answer'],'time_limit':None},
        completion_rule={'success':'matching_stimulus_key','rounds':12},
        content={'revision':REVISION,'bank_key':'scene-words-'+scene['key']+'-v1','stimuli':stimuli,
            'difficulty_levels':[{'level':i,'option_count':i+1,'rounds':12,'max_attempts':3} for i in (1,2,3)],
            'round_choices':[6,12,18,24],'default_rounds':12,'max_rounds':60,
            'asset_registry':[{'media_ref':p,'origin':'Оригинальная сгенерированная учебная иллюстрация Söyle','license':'Синтетический проектный ресурс Söyle','license_status':'documented'} for p in paths]},method_card=method)


BANKS = [make_bank(scene) for scene in LOCATIONS]
SPEECH = tuple(sorted({text for bank in BANKS for item in bank['content']['stimuli'] for text in (item['speech'],item['hint'],f"Это {item['label'].lower()}.")}))

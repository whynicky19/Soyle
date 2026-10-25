"""Authoritative scene-search transitions; shared sessions remain the result ledger."""
import hashlib
import json
import math
import random
from copy import deepcopy
from uuid import uuid4
from fastapi import HTTPException
from .database import now_iso
from .exploration_content import hit_object
from .exercise_engine import get_version,published_exercise
from .vocabulary import observe,focus_for_exercise


def snapshot(db,run):
    run=dict(run);version=get_version(db,run['version_id']);state=json.loads(run['state_json'])
    return {'id':run['id'],'revision':run['revision'],'preview':run['child_id'] is None,'exercise_id':version['exercise_id'],'version_id':version['id'],'scene':version['content']['exploration'],'state':state,'measurement':measurement(state),'details':details(run,state,version)}


def empty_round():return {'responses':[],'related_responses':[],'audio_presentations':0,'resume_replays':0,'outside_taps':0,'hint_level':0,'repeats':0,'audio_ready':False,'resolved':False}


def start_run(db,version,*,child_id=None,preview_owner=None,level=1,rounds=4,accessible_labels=False,learning_session_id=None):
    if level==1 and rounds!=4:raise HTTPException(422,'На начальном уровне — четыре крупные цели; на рисунке остаются все 12 предметов.')
    if child_id is not None:
        old=db.execute('SELECT * FROM exploration_runs WHERE child_id=? AND version_id=? AND learning_session_id IS NULL ORDER BY updated_at DESC LIMIT 1',(child_id,version['id'])).fetchone() if learning_session_id is None else db.execute('SELECT * FROM exploration_runs WHERE child_id=? AND version_id=? AND learning_session_id=? ORDER BY updated_at DESC LIMIT 1',(child_id,version['id'],learning_session_id)).fetchone()
        if old and json.loads(old['state_json'])['status'] in {'active','paused','completed'}:
            saved=json.loads(old['state_json'])
            submitted=db.execute('SELECT session_id FROM exploration_submissions WHERE run_id=? ORDER BY revision DESC LIMIT 1',(old['id'],)).fetchone()
            if saved['status']!='completed' or not submitted:return snapshot(db,old)
    scene=version['content']['exploration'];objects=[o for o in scene['objects'] if level!=1 or o['beginner']]
    rng=random.Random(str(uuid4()));rng.shuffle(objects)
    counts={};preferred=[]
    if child_id is not None:
        counts={r['concept_id']:r['n'] for r in db.execute("SELECT concept_id,COUNT(*) n FROM word_observations WHERE child_id=? AND context='scene' AND outcome<>'incomplete' GROUP BY concept_id",(child_id,)).fetchall()}
        exercise={'id':version['exercise_id'],'engine':{'version_id':version['id'],'mechanic':'scene_search','content':version['content']}}
        preferred=focus_for_exercise(db,child_id,exercise)['preferred_stimulus_keys']
    objects.sort(key=lambda o:(0 if o['id'] in preferred else 1,counts.get(o['concept_id'],0)))
    if len(objects)<rounds:raise HTTPException(422,'Для выбранной серии не хватает проверенных целей')
    state={'status':'active','level':level,'accessible_labels':accessible_labels,'order':[o['id'] for o in objects[:rounds]],'index':0,'round':empty_round(),'outcomes':[],'feedback':''}
    run_id=str(uuid4());stamp=now_iso()
    db.execute('INSERT INTO exploration_runs(id,child_id,preview_owner,version_id,learning_session_id,state_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?)',(run_id,child_id,preview_owner,version['id'],learning_session_id,json.dumps(state),stamp,stamp))
    return snapshot(db,db.execute('SELECT * FROM exploration_runs WHERE id=?',(run_id,)).fetchone())


def transition(scene,state,event):
    state=deepcopy(state);action=event.action;r=state['round'];status=state['status']
    if status in {'refused','technical_error','completed'}:raise HTTPException(409,'Эта серия завершена. Можно открыть новую.')
    if action=='resume':
        if status!='paused':raise HTTPException(409,'Серия уже открыта')
        state['status']='active';r['audio_ready']=False;return state
    if action in {'pause','refuse','technical_error'}:
        state['status']={'pause':'paused','refuse':'refused','technical_error':'technical_error'}[action]
        state['feedback']=event.reason if action=='technical_error' else '';return state
    if status!='active':raise HTTPException(409,'Сначала продолжите серию')
    if action=='next':
        if not r['resolved']:raise HTTPException(409,'Сначала найдите предмет')
        if state['index']+1==len(state['order']):state['status']='completed'
        else:state['index']+=1;state['round']=empty_round();state['feedback']=''
        return state
    if action in {'audio','repeat'}:
        if event.audio_success is not True:
            state['status']='technical_error';state['feedback']='Не удалось воспроизвести инструкцию. Ответ не оценивается.';return state
        if action=='repeat':r['repeats']+=1
        elif r.get('audio_presentations',0):r['resume_replays']=r.get('resume_replays',0)+1
        r['audio_presentations']=r.get('audio_presentations',0)+1
        r['audio_ready']=True;return state
    if not r['audio_ready'] or r['resolved']:raise HTTPException(409,'Сначала прослушайте текущую инструкцию')
    if action=='hint':r['hint_level']=min(2,r['hint_level']+1);state['feedback']='Посмотри в подсвеченную область.';return state
    if action in {'select','outside'}:
        if event.keyboard:
            selected=next((o for o in scene['objects'] if o['id']==event.object_id),None)
            if not selected:raise HTTPException(422,'Такого предмета нет в этой версии сцены')
        else:
            point=event.point
            if point is None or len(point)!=2 or any(not math.isfinite(c) or not 0<=c<=1 for c in point):raise HTTPException(422,'Координаты должны относиться к исходной сцене')
            selected=hit_object(scene,point)
        if selected is None:r['outside_taps']+=1;state['feedback']='Рассмотри картинку. Предмет можно найти без спешки.';return state
        target=next(o for o in scene['objects'] if o['id']==state['order'][state['index']])
        if selected['id'] in target.get('related_surfaces',[]):
            r.setdefault('related_responses',[]).append(selected['id']);state['feedback']=target['part_feedback'];return state
        r['responses'].append({'object_id':selected['id'],'point':event.point,'keyboard':event.keyboard})
        if len(r['responses'])>200:raise HTTPException(422,'Слишком много нажатий. Сделайте перерыв и продолжите позже.')
        if selected['id']!=target['id']:state['feedback']='Давай попробуем ещё раз.';return state
        r['resolved']=True;independent=len(r['responses'])==1 and not r['hint_level'] and not r['repeats'] and not r.get('related_responses') and not state['accessible_labels']
        state['outcomes'].append({'target_key':target['id'],'concept_id':target['concept_id'],'label':target['label'],'outcome':'independent' if independent else 'prompted',**deepcopy(r)})
        state['feedback']='Да, это '+target['label'].lower()+'!'
        return state
    raise HTTPException(422,'Неизвестное действие')


def measurement(state):
    outcomes=state['outcomes'];independent=sum(o['outcome']=='independent' for o in outcomes)
    partial=[] if state['round']['resolved'] or state['status']=='completed' else [state['round']]
    rounds=[*outcomes,*partial];attempts=sum(len(o['responses']) for o in rounds)
    supports=sum(o['hint_level']+o['repeats']+len(o.get('related_responses',[]))+max(0,len(o['responses'])-int(o.get('resolved',False))) for o in rounds)
    status={'active':'break','paused':'break','completed':'participated' if state['accessible_labels'] else 'completed','refused':'refused','technical_error':'technical_error'}[state['status']]
    return dict(attempt_status=status,attempts_count=attempts,correct_answers=len(outcomes),independent_completions=independent,prompted_completions=len(outcomes)-independent,prompts_used=supports,gameplay_choices=attempts,independence=round(independent/len(outcomes)*100) if outcomes else 0,prompt_level='minimal' if supports or state['accessible_labels'] else 'independent',communication_initiatives=0)


def details(run,state,version):
    return {'mechanic':'scene_search','exploration_run_id':run['id'],'exploration_revision':run['revision'],'server_verified':True,'bank_key':version['content']['bank_key'],'location_key':version['content']['exploration']['key'],'image_version':version['content']['exploration']['image']['version'],'difficulty_level':state['level'],'round_count':len(state['outcomes']),'planned_round_count':len(state['order']),'round_outcomes':state['outcomes'],'first_choice_correct':sum(len(o['responses'])==1 for o in state['outcomes']),'outside_taps':sum(o['outside_taps'] for o in state['outcomes'])+(0 if state['round']['resolved'] else state['round']['outside_taps']),'accessibility_mode':'spoken_options_non_scored' if state['accessible_labels'] else 'visual_scene','unfinished_round':None if state['round']['resolved'] or state['status']=='completed' else state['round']}


def apply_event(db,run,event):
    run=dict(run);payload=event.model_dump(mode='json');digest=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
    db.execute('UPDATE exploration_runs SET revision=revision WHERE id=?',(run['id'],))
    saved=db.execute('SELECT * FROM exploration_events WHERE run_id=? AND event_id=?',(run['id'],event.event_id)).fetchone()
    if saved:
        if saved['request_hash']!=digest:raise HTTPException(409,'Идентификатор события уже использован')
        return snapshot(db,{**run,'state_json':saved['state_json'],'revision':saved['revision']})
    current=db.execute('SELECT * FROM exploration_runs WHERE id=?',(run['id'],)).fetchone();run=dict(current)
    if run['revision']!=event.expected_revision:raise HTTPException(409,'Серия изменилась в другом окне. Обновите её.')
    version=get_version(db,run['version_id']);scene=version['content']['exploration'];previous=json.loads(run['state_json']);state=transition(scene,previous,event)
    serialized=json.dumps(state,ensure_ascii=False);revision=run['revision']+1;stamp=now_iso()
    db.execute('UPDATE exploration_runs SET state_json=?,revision=?,updated_at=? WHERE id=? AND revision=?',(serialized,revision,stamp,run['id'],run['revision']))
    db.execute('INSERT INTO exploration_events(run_id,event_id,request_hash,state_json,revision,created_at) VALUES(?,?,?,?,?,?)',(run['id'],event.event_id,digest,serialized,revision,stamp))
    if run['child_id'] is not None and not state['accessible_labels']:
        position=previous['index'];target=next(o for o in scene['objects'] if o['id']==previous['order'][position])
        resolved=len(state['outcomes'])>len(previous['outcomes'])
        interrupted=state['status'] in {'paused','refused','technical_error'} and not previous['round']['resolved'] and previous['round']['audio_ready']
        if resolved or interrupted:
            result=state['outcomes'][-1] if resolved else state['round']
            observe(db,child_id=run['child_id'],concept_id=target['concept_id'],source_key='scene:'+run['id'],position=position,context='scene',outcome=result['outcome'] if resolved else 'incomplete',first_correct=resolved and len(result['responses'])==1,errors=len(result['responses'])-int(resolved),repeats=result['repeats'],hint_level=result['hint_level'],responses=result['responses'],supports=[*(['broad_region'] if result['hint_level'] else []),*(['focused_region'] if result['hint_level']>1 else []),*['repeat_audio']*result['repeats'],*(['part_whole_guidance'] if result.get('related_responses') else []),*['resume_audio']*result.get('resume_replays',0)],run_id=run['id'])
            if resolved:db.execute('UPDATE vocabulary_repetitions SET last_practiced_at=? WHERE child_id=? AND concept_id=?',(stamp,run['child_id'],target['concept_id']))
    return snapshot(db,{**run,'state_json':serialized,'revision':revision})


def trusted_submission(db,payload,exercise):
    run_id=payload.details.get('exploration_run_id');run=db.execute('SELECT * FROM exploration_runs WHERE id=? AND child_id=?',(run_id,payload.child_id)).fetchone()
    if not run or run['preview_owner'] is not None or run['version_id']!=exercise['engine']['version_id']:raise HTTPException(422,'Нужна серверная запись этой версии игры')
    db.execute('UPDATE exploration_runs SET revision=revision WHERE id=?',(run_id,));run=dict(db.execute('SELECT * FROM exploration_runs WHERE id=?',(run_id,)).fetchone())
    if run['learning_session_id']!=payload.learning_session_id:raise HTTPException(409,'Результат относится к другому занятию')
    if run['revision']!=payload.details.get('exploration_revision'):raise HTTPException(409,'Есть более новое состояние серии. Восстановите его перед сохранением.')
    state=json.loads(run['state_json'])
    if state['status']=='active':raise HTTPException(409,'Сначала завершите серию или поставьте её на паузу')
    if db.execute('SELECT session_id FROM exploration_submissions WHERE run_id=? AND revision=?',(run_id,run['revision'])).fetchone():raise HTTPException(409,'Эта попытка уже сохранена')
    if state['status']=='completed' and db.execute("SELECT s.session_id FROM exploration_submissions s JOIN sessions x ON x.id=s.session_id WHERE s.run_id=? AND x.attempt_status IN ('completed','participated')",(run_id,)).fetchone():raise HTTPException(409,'Серия уже засчитана')
    version=get_version(db,run['version_id'])
    return payload.model_copy(update={**measurement(state),'details':details(run,state,version)}),run

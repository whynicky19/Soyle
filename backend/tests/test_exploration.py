from audio_fixtures import approve_fixture_version
import hashlib,json
from copy import deepcopy
from uuid import uuid4
from pathlib import Path
import pytest
from app.database import connect
from app.exploration_content import LOCATIONS,draft_for_location,validate_exploration,hit_object
from app.migrations import _migration_34_explore_world
from app.vocabulary import observe
from test_varied_mechanics import isolated_database

def child_id(c,h):return c.get('/api/children',headers=h).json()[0]['id']
def publish(c,h,key):
    v=next(x['version'] for x in c.get('/api/admin/exercise-drafts',headers=h).json() if (x['version']['content'].get('exploration') or {}).get('key')==key)
    approve_fixture_version(v["id"])
    r=c.post(f'/api/admin/exercise-drafts/{v["id"]}/publish',headers=h);assert r.status_code==200,r.text;return v

def send(c,h,s,action,**extra):
    body=dict(event_id=str(uuid4()),expected_revision=s['revision'],action=action,**extra)
    r=c.post(f'/api/exploration/runs/{s["id"]}/events',headers=h,json=body);assert r.status_code==200,r.text;return r.json(),body

def submit(c,h,child,s,status='completed',event_id=None):
    return c.post('/api/sessions',headers=h,json=dict(event_id=event_id or str(uuid4()),child_id=child,exercise_id=s['exercise_id'],module='sensory',score=100,duration_seconds=20,details=s['details'],actor_role='parent',response_owner='child',support_context='independent',attempt_status=status,attempts_count=0,correct_answers=0))

def target(s):return next(o for o in s['scene']['objects'] if o['id']==s['state']['order'][s['state']['index']])

def test_all_48_regions_are_version_bound_and_disjoint():
    assert hit_object(LOCATIONS[2],[.5,.69])["concept_id"]=="carpet"
    assert hit_object(LOCATIONS[3],[.5,.72])["concept_id"]=="sandbox"
    concepts=set()
    for scene in LOCATIONS:
        assert validate_exploration(draft_for_location(scene)['content'])==[]
        image=Path(__file__).parents[2]/'frontend/public'/scene['image']['media_ref'].lstrip('/')
        assert hashlib.sha256(image.read_bytes()).hexdigest()==scene['image']['sha256']
        for obj in scene['objects']:
            assert obj['concept_id'] not in concepts;concepts.add(obj['concept_id']);assert hit_object(scene,obj['hit_point'])['id']==obj['id']
    broken=deepcopy(draft_for_location(LOCATIONS[0])['content']);broken['exploration']['objects'][1]['hit_polygons']=broken['exploration']['objects'][0]['hit_polygons']
    assert any('пересекаются' in e for e in validate_exploration(broken));assert len(concepts)==48

@pytest.mark.parametrize('key',[s['key'] for s in LOCATIONS])
def test_each_location_verifies_twelve_targets_and_shared_result_once(client,admin_headers,parent_headers,isolated_database,key):
    c=client;h=parent_headers;child=child_id(c,h);v=publish(c,admin_headers,key)
    r=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':v['exercise_id'],'level':2,'rounds':12});assert r.status_code==200,r.text;s=r.json();seen=set()
    for _ in range(12):
        obj=target(s);seen.add(obj['concept_id']);s,_=send(c,h,s,'audio',audio_success=True);s,body=send(c,h,s,'select',point=obj['hit_point'])
        assert s['state']['round']['resolved'];assert c.post(f'/api/exploration/runs/{s["id"]}/events',headers=h,json=body).json()==s;s,_=send(c,h,s,'next')
    assert len(seen)==12 and s['state']['status']=='completed';event=str(uuid4());r=submit(c,h,child,s,event_id=event);assert r.status_code==201,r.text
    result=r.json();assert result['score']==100 and result['awarded_stars']>0
    assert submit(c,h,child,s,event_id=event).json()['awarded_stars']==0;assert submit(c,h,child,s).status_code==409
    with connect() as db:
        row=db.execute('SELECT * FROM sessions WHERE id=?',(result['id'],)).fetchone();assert row['independent_completions']==12 and row['attempts_count']==12
        assert db.execute('SELECT COUNT(*) n FROM word_observations WHERE child_id=?',(child,)).fetchone()['n']==12
    words=c.get(f'/api/vocabulary/{child}',headers=h).json()['words'];assert len(words)==12 and all(w['independent']==1 for w in words)

def test_pause_resume_separates_wrong_objects_hints_empty_taps_and_audio_failure(client,admin_headers,parent_headers,isolated_database):
    c=client;h=parent_headers;child=child_id(c,h);v=publish(c,admin_headers,'kitchen')
    s=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':v['exercise_id'],'level':2,'rounds':4}).json();s,_=send(c,h,s,'audio',audio_success=True)
    obj=target(s);other=next(o for o in s['scene']['objects'] if o['id']!=obj['id']);s,_=send(c,h,s,'select',point=[.99,.99]);assert s['measurement']['attempts_count']==0
    s,_=send(c,h,s,'select',object_id=obj['id'],point=other['hit_point']);assert not s['state']['round']['resolved']
    s,_=send(c,h,s,'hint');s,_=send(c,h,s,'hint');s,_=send(c,h,s,'repeat',audio_success=True);s,_=send(c,h,s,'select',point=obj['hit_point']);assert s['state']['outcomes'][0]['outcome']=='prompted'
    s,_=send(c,h,s,'next');s,_=send(c,h,s,'pause');r=submit(c,h,child,s,status='break');assert r.status_code==201,r.text;assert r.json()['awarded_stars']==0
    restored=c.get(f'/api/exploration/{child}/active?exercise_id={v["exercise_id"]}',headers=h).json();assert restored['id']==s['id'] and restored['state']['index']==1
    s,_=send(c,h,restored,'resume');assert not s['state']['round']['audio_ready']
    for _ in range(3):
        obj=target(s);s,_=send(c,h,s,'audio',audio_success=True);s,_=send(c,h,s,'select',point=obj['hit_point']);s,_=send(c,h,s,'next')
    r=submit(c,h,child,s);assert r.status_code==201,r.text
    with connect() as db:
        row=db.execute('SELECT * FROM sessions WHERE id=?',(r.json()['id'],)).fetchone();assert row['attempts_count']==5 and row['correct_answers']==4 and row['independent_completions']==3 and row['prompted_completions']==1
        assert not db.execute('SELECT * FROM vocabulary_repetitions WHERE child_id=?',(child,)).fetchone()
    s=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':v['exercise_id']}).json();s,_=send(c,h,s,'audio',audio_success=False);assert s['state']['status']=='technical_error'
    assert submit(c,h,child,s,status='technical_error').json()['awarded_stars']==0

def test_draft_preview_and_child_permissions(client,admin_headers,parent_headers,student_headers,isolated_database):
    c=client;child=child_id(c,parent_headers);v=next(x['version'] for x in c.get('/api/admin/exercise-drafts',headers=admin_headers).json() if x['version']['mechanic']=='scene_search')
    assert v['exercise_id'] not in {e['id'] for e in c.get('/api/exercises',headers=student_headers).json()}
    assert c.post(f'/api/exploration/{child}/runs',headers=student_headers,json={'exercise_id':v['exercise_id']}).status_code==404
    assert c.post(f'/api/exploration/previews/{v["id"]}',headers=student_headers,json={}).status_code==403
    s=c.post(f'/api/exploration/previews/{v["id"]}',headers=admin_headers,json={}).json();assert s['preview'];s,_=send(c,admin_headers,s,'audio',audio_success=True);s,_=send(c,admin_headers,s,'select',point=target(s)['hit_point'])
    with connect() as db:
        assert db.execute('SELECT COUNT(*) n FROM word_observations').fetchone()['n']==0
        before=db.execute('SELECT COUNT(*) n FROM exercises').fetchone()['n'];_migration_34_explore_world(db);assert db.execute('SELECT COUNT(*) n FROM exercises').fetchone()['n']==before
    assert c.delete(f'/api/exploration/previews/{s["id"]}',headers=admin_headers).status_code==204
    other=c.post('/api/children',headers=parent_headers,json={'name':'Другой ребёнок','birth_date':'2020-01-01'}).json()['id'];assert c.get(f'/api/vocabulary/{other}',headers=student_headers).status_code==403

def test_words_need_multiple_distinct_practices_and_recover_via_cards(client,parent_headers,isolated_database):
    child=child_id(client,parent_headers)
    with connect() as db:
        def trial(source,context='scene',outcome='prompted'):
            observe(db,child_id=child,concept_id='carrot',source_key=source,position=0,context=context,outcome=outcome,first_correct=outcome=='independent',errors=int(outcome=='prompted'))
        trial('one');trial('one');assert not db.execute('SELECT * FROM vocabulary_repetitions WHERE child_id=?',(child,)).fetchone()
        trial('pause',outcome='incomplete');trial('two');assert not db.execute('SELECT * FROM vocabulary_repetitions WHERE child_id=?',(child,)).fetchone()
        trial('three');assert db.execute('SELECT status FROM vocabulary_repetitions WHERE child_id=?',(child,)).fetchone()['status']=='reinforce'
        for index in range(3):trial('card-'+str(index),'card','independent')
        assert db.execute('SELECT status FROM vocabulary_repetitions WHERE child_id=?',(child,)).fetchone()['status']=='return_scene'
        trial('return1','scene','independent');trial('return2','scene','independent');assert db.execute('SELECT status FROM vocabulary_repetitions WHERE child_id=?',(child,)).fetchone()['status']=='monitoring'
    words=client.get(f'/api/vocabulary/{child}',headers=parent_headers).json()['words'];assert words[0]['observations']==8 and words[0]['unfinished']==1
    assert client.patch(f'/api/vocabulary/{child}/policy',headers=parent_headers,json={}).status_code==403


def test_specialist_word_history_and_policy_require_current_family_permission(client,admin_headers,isolated_database):
    from test_privacy_specialist import family,register,consent
    c=client
    _,parent,child=family(c)
    specialist,_=register(c,'word_specialist')
    assert c.patch(f'/api/admin/users/{specialist["id"]}/role',headers=admin_headers,json={'role':'specialist'}).status_code==200
    login=c.post('/api/auth/login',headers={'X-Soyle-Auth-Mode':'bearer'},json={'username':specialist['username'],'password':'PrivacyTest123!'})
    assert login.status_code==200
    h={'Authorization':'Bearer '+login.json()['access_token']}
    policy={'min_observations':4,'difficulty_observations':2,'recovery_independent':2,'recent_window':6,'cooldown_hours':48}
    path=f'/api/vocabulary/{child}'
    assert c.get(path,headers=h).status_code==403
    assert c.patch(path+'/policy',headers=h,json=policy).status_code==403
    consent(c,parent,child,True)
    grants=f'/api/children/{child}/specialists'
    assert c.post(grants,headers=parent,json={'username':specialist['username']}).status_code==201
    with connect() as db:
        observe(db,child_id=child,concept_id='carrot',source_key='scene:permission-test',position=0,context='scene',outcome='independent',first_correct=True)
    assert c.get(path,headers=h).json()==c.get(path,headers=parent).json()
    changed=c.patch(path+'/policy',headers=h,json=policy)
    assert changed.status_code==200 and changed.json()['policy']==policy
    assert c.get(path,headers=parent).json()['policy']==policy
    with connect() as db:
        assert db.execute('SELECT updated_by FROM vocabulary_policies WHERE child_id=?',(child,)).fetchone()['updated_by']==specialist['id']
    assert c.patch(path+'/policy',headers=h,json={**policy,'recent_window':3}).status_code==422
    assert c.delete(f'{grants}/{specialist["id"]}',headers=parent).status_code==204
    assert c.get(path,headers=h).status_code==403
    assert c.patch(path+'/policy',headers=h,json=policy).status_code==403

def test_difficult_word_enters_related_card_plan_then_returns_to_scene(client,admin_headers,parent_headers,isolated_database):
    from app.exercise_engine import published_exercise_rows
    c=client;h=parent_headers;child=child_id(c,h);kitchen=publish(c,admin_headers,'kitchen')
    with connect() as db:
        cards=next(e for e in published_exercise_rows(db) if e['engine']['mechanic']=='auditory_choice' and any(s['label']=='Морковь' for s in e['engine']['content']['stimuli']))
        for index in range(3):observe(db,child_id=child,concept_id='carrot',source_key='difficulty-'+str(index),position=0,context='scene',outcome='prompted',first_correct=False,errors=1)
    goal=c.post('/api/practice-goals',headers=h,json={'child_id':child,'template_key':'understand-words-in-scenes','baseline':'Ищет с помощью','help_level':'minimal'});assert goal.status_code==201,goal.text
    plan=c.post(f'/api/adaptive-plans/{child}',headers=h,json={'target_minutes':3});assert plan.status_code==201,plan.text
    first=plan.json()['items'][0];assert first['exercise_id']==cards['id']
    carrot=next(s['key'] for s in cards['engine']['content']['stimuli'] if s['label']=='Морковь')
    assert first['difficulty_params']['preferred_stimulus_keys']==[carrot]
    assert first['difficulty_params']['word_concept_ids']==['carrot'] and 'vocabulary_reinforcement' in first['assignment_reason']['codes']
    with connect() as db:
        for index in range(3):observe(db,child_id=child,concept_id='carrot',source_key='recovery-'+str(index),position=0,context='card',outcome='independent',first_correct=True)
    plan=c.post(f'/api/adaptive-plans/{child}',headers=h,json={'target_minutes':3}).json();first=plan['items'][0]
    assert first['exercise_id']==kitchen['exercise_id'] and first['difficulty_params']['preferred_stimulus_keys']==['kitchen-carrot']
    assert first['difficulty_params']['difficulty_level']==2
    learning=c.post('/api/learning-sessions',headers=h,json={'child_id':child,'exercise_ids':[i['exercise_id'] for i in plan['items']],'target_minutes':3,'adaptive_plan_id':plan['id']});assert learning.status_code==201,learning.text
    opened=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':kitchen['exercise_id'],'learning_session_id':learning.json()['id'],'level':3,'rounds':12})
    assert opened.status_code==200,opened.text
    assert opened.json()['state']['level']==2 and len(opened.json()['state']['order'])==4 and opened.json()['state']['order'][0]=='kitchen-carrot'


def test_part_whole_touch_is_guidance_not_a_word_error(client,admin_headers,parent_headers,isolated_database):
    c=client;h=parent_headers;child=child_id(c,h);v=publish(c,admin_headers,'bedroom')
    s=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':v['exercise_id'],'level':2,'rounds':12}).json()
    # Advance other targets until the bed instruction appears; no fixed target order is assumed.
    while target(s)['concept_id']!='bed':
        obj=target(s);s,_=send(c,h,s,'audio',audio_success=True);s,_=send(c,h,s,'select',point=obj['hit_point']);s,_=send(c,h,s,'next')
    s,_=send(c,h,s,'audio',audio_success=True);pillow=next(o for o in s['scene']['objects'] if o['concept_id']=='pillow');s,_=send(c,h,s,'select',point=pillow['hit_point'])
    assert not s['state']['round']['responses'] and s['state']['round']['related_responses']==['bedroom-pillow']
    assert s['state']['feedback']=='Покажи деревянную часть кровати.'
    s,_=send(c,h,s,'select',point=target(s)['hit_point']);assert s['state']['outcomes'][-1]['outcome']=='prompted'
    with connect() as db:
        observation=db.execute("SELECT * FROM word_observations WHERE child_id=? AND concept_id='bed'",(child,)).fetchone();assert observation['errors']==0 and 'part_whole_guidance' in json.loads(observation['supports_json'])


def test_accessible_labels_and_refusal_do_not_raise_word_skill(client,admin_headers,parent_headers,isolated_database):
    c=client;h=parent_headers;child=child_id(c,h);v=publish(c,admin_headers,'playground')
    s=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':v['exercise_id'],'accessible_labels':True}).json()
    for _ in range(4):s,_=send(c,h,s,'audio',audio_success=True);s,_=send(c,h,s,'select',object_id=target(s)['id'],keyboard=True);s,_=send(c,h,s,'next')
    r=submit(c,h,child,s);assert r.status_code==201 and r.json()['attempt_status']=='participated'
    assert c.get(f'/api/vocabulary/{child}',headers=h).json()['words']==[]
    s=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':v['exercise_id']}).json();s,_=send(c,h,s,'audio',audio_success=True);s,_=send(c,h,s,'refuse')
    r=submit(c,h,child,s,status='refused');assert r.status_code==201 and r.json()['attempt_status']=='refused' and r.json()['awarded_stars']==0
    assert all(w['observations']==0 for w in c.get(f'/api/vocabulary/{child}',headers=h).json()['words'])


def test_goal_progress_counts_questions_while_precision_counts_actual_choices(client,admin_headers,parent_headers,isolated_database):
    from app.adaptive_planner import _evidence,DEFAULT_THRESHOLDS
    from app.exercise_engine import published_exercise
    c=client;h=parent_headers;child=child_id(c,h);v=publish(c,admin_headers,'kitchen')
    goal=c.post('/api/practice-goals',headers=h,json={'child_id':child,'template_key':'understand-words-in-scenes','baseline':'Ищет в знакомой комнате','help_level':'minimal'}).json()
    plan=c.post(f'/api/adaptive-plans/{child}',headers=h,json={'target_minutes':10}).json()
    learning=c.post('/api/learning-sessions',headers=h,json={'child_id':child,'exercise_ids':[i['exercise_id'] for i in plan['items']],'target_minutes':10,'adaptive_plan_id':plan['id']}).json()
    s=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':v['exercise_id'],'learning_session_id':learning['id']}).json()
    for i in range(4):
        obj=target(s);s,_=send(c,h,s,'audio',audio_success=True)
        if i==0:
            other=next(o for o in s['scene']['objects'] if o['id']!=obj['id']);s,_=send(c,h,s,'select',point=other['hit_point'])
            s,_=send(c,h,s,'pause');s,_=send(c,h,s,'resume');s,_=send(c,h,s,'audio',audio_success=True)
            assert s['state']['round']['resume_replays']==1 and s['state']['round']['repeats']==0
        s,_=send(c,h,s,'select',point=obj['hit_point']);s,_=send(c,h,s,'next')
    response=c.post('/api/sessions',headers=h,json=dict(event_id=str(uuid4()),child_id=child,exercise_id=v['exercise_id'],module='sensory',score=0,duration_seconds=30,learning_session_id=learning['id'],details=s['details'],actor_role='parent',response_owner='child',support_context='independent',attempts_count=0,correct_answers=0));assert response.status_code==201,response.text
    current=next(g for g in c.get(f'/api/practice-goals/{child}',headers=h).json() if g['id']==goal['id'])
    assert current['progress']['rounds']==4 and current['progress']['independent']==3 and current['progress']['without_child_answer']==0 and current['progress']['independent_rate']==75
    with connect() as db:
        evidence=_evidence(db,child,published_exercise(db,v['exercise_id']),DEFAULT_THRESHOLDS)
        assert evidence['weighted_accuracy']==.8 and evidence['weighted_independent_accuracy']==.75

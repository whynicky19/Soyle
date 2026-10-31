from audio_fixtures import approve_fixture_version
import hashlib,json
from copy import deepcopy
from datetime import datetime,timedelta,timezone
from pathlib import Path
from uuid import uuid4
import pytest
from app.database import connect
from app.word_reinforcement import BANKS,CONTRASTS,REUSED_IMAGES,SPEECH,TARGETS
from app.exploration_content import LOCATIONS
from app.exercise_engine import validate_version
from app.schemas import ExerciseDraftCreate
from app.tts_library import bundled_tts_path
from app.migrations import _migration_35_scene_word_reinforcement
from app.vocabulary import observe
from test_varied_mechanics import isolated_database
from test_exploration import send,target

PUBLIC=Path(__file__).resolve().parents[2]/'frontend/public'

def publish(c,h,target_key):
    draft=next(d for d in c.get('/api/admin/exercise-drafts',headers=h).json() if d['version']['target']==target_key)
    assert draft['valid'],draft['errors']
    approve_fixture_version(draft["version"]["id"])
    r=c.post(f'/api/admin/exercise-drafts/{draft["version"]["id"]}/publish',headers=h)
    assert r.status_code==200,r.text
    return r.json()

def child(c,h):return c.get('/api/children',headers=h).json()[0]['id']

def card_session(c,h,child_id,version,help_first=False):
    items=version['content']['stimuli'];outcomes=[]
    for i,item in enumerate(items):
        supported=help_first and i==0
        outcomes.append({'target_key':item['key'],'selected_key':item['key'],'first_response':item['key'],
            'attempts':1,'outcome':'prompted' if supported else 'independent','supports':['visual_hint'] if supported else [],
            'option_keys':[item['key'],*item['distractor_keys'][:2]],'media_ref':item['media_ref']})
    body=dict(event_id=str(uuid4()),child_id=child_id,exercise_id=version['exercise_id'],module='sensory',score=100,duration_seconds=30,
        actor_role='parent',response_owner='child',support_context='independent',attempts_count=12,correct_answers=12,
        independent_completions=11 if help_first else 12,prompted_completions=int(help_first),prompts_used=int(help_first),
        details={'bank_key':version['content']['bank_key'],'exercise_version_id':version['id'],'round_count':12,'difficulty_level':2,'option_count':3,'round_outcomes':outcomes})
    r=c.post('/api/sessions',headers=h,json=body);assert r.status_code==201,r.text
    return body,r.json()

def test_four_banks_cover_48_concepts_with_37_unique_new_assets_and_bundled_speech():
    manifest=json.loads((PUBLIC/'word-reinforcement/assets-manifest.json').read_text())
    assert manifest['generated_count']==37 and manifest['reused_count']==11
    assert len(manifest['items'])==37 and len({i['sha256'] for i in manifest['items']})==37
    concepts={o['concept_id']:o['label'] for s in LOCATIONS for o in s['objects']}
    assert len(REUSED_IMAGES)==11 and len(concepts)==48
    assert {i['key'] for i in manifest['items']}==set(concepts)-set(REUSED_IMAGES)
    for asset in manifest['items']:
        path=PUBLIC/asset['media_ref'].lstrip('/')
        assert path.suffix=='.webp' and hashlib.sha256(path.read_bytes()).hexdigest()==asset['sha256']
        assert asset['width']==asset['height'] and asset['width']>=1024
    all_keys=[]
    for bank in BANKS:
        parsed=ExerciseDraftCreate.model_validate(bank).model_dump(mode='json')
        assert validate_version(parsed)==[]
        items=parsed['content']['stimuli'];keys={s['key'] for s in items}
        assert len(items)==len(keys)==12
        assert parsed['content']['round_choices']==[6,12,18,24] and parsed['content']['default_rounds']==12
        for s in items:
            all_keys.append(s['key']);assert s['word_concept_id']==s['key'] and concepts[s['key']]==s['label']
            assert len(set(s['distractor_keys']))>=6 and set(s['distractor_keys'])<=keys-{s['key']}
            assert (PUBLIC/s['media_ref'].lstrip('/')).is_file()
    assert len(all_keys)==len(set(all_keys))==48
    assert 'bed' not in CONTRASTS['pillow'] and 'bed' not in CONTRASTS['blanket']
    assert len(SPEECH)==144 and all(bundled_tts_path(t).is_file() for t in SPEECH)

@pytest.mark.parametrize('bad',[['unknown','pillow','blanket'],['pillow','pillow','blanket'],['bed','pillow','blanket']])
def test_invalid_contrast_pools_cannot_be_published(bad):
    bank=deepcopy(BANKS[0]);bank['content']['stimuli'][0]['distractor_keys']=bad
    assert any('Отвлекающие' in e for e in validate_version(bank))

def test_publication_closes_every_gap_and_retains_explicit_concept_links(client,admin_headers,parent_headers,isolated_database):
    c=client;h=parent_headers;ch=child(c,h)
    assert not any(e['target'] in TARGETS for e in c.get('/api/exercises',headers=h).json())
    versions=[publish(c,admin_headers,t) for t in TARGETS]
    with connect() as db:
        assert db.execute("SELECT COUNT(*) n FROM vocabulary_content_gaps WHERE status<>'available'").fetchone()['n']==0
        assert all(r['note'].startswith('Есть опубликованные') for r in db.execute('SELECT note FROM vocabulary_content_gaps').fetchall())
        for version in versions:
            links=db.execute('SELECT * FROM word_concept_stimuli WHERE version_id=?',(version['id'],)).fetchall()
            assert len(links)==12 and all(r['concept_id']==r['stimulus_key'] for r in links)
        before=[dict(r) for r in db.execute('SELECT * FROM exercise_versions ORDER BY id').fetchall()]
        _migration_35_scene_word_reinforcement(db)
        assert before==[dict(r) for r in db.execute('SELECT * FROM exercise_versions ORDER BY id').fetchall()]
    body,result=card_session(c,h,ch,versions[0],help_first=True)
    assert c.post('/api/sessions',headers=h,json=body).json()['awarded_stars']==0
    words=c.get(f'/api/vocabulary/{ch}',headers=h).json()['words']
    assert len(words)==12 and next(w for w in words if w['concept_id']=='bed')['with_help']==1
    assert all(not w['content_pending'] for w in words)

@pytest.mark.parametrize('location,concept',[(0,'pillow'),(1,'kettle'),(2,'remote'),(3,'butterfly')])
def test_new_word_moves_from_scene_difficulty_through_three_card_practices_back_to_its_scene(client,admin_headers,parent_headers,isolated_database,location,concept):
    c=client;h=parent_headers;ch=child(c,h)
    cards=publish(c,admin_headers,TARGETS[location]);scene=publish(c,admin_headers,'explore-'+LOCATIONS[location]['key'])
    with connect() as db:
        for i in range(3):observe(db,child_id=ch,concept_id=concept,source_key=f'scene:word-test-{i}',position=0,context='scene',outcome='prompted',first_correct=False,errors=1)
    r=c.post('/api/practice-goals',headers=h,json={'child_id':ch,'template_key':'understand-words-in-scenes','baseline':'Synthetic word transfer test','help_level':'minimal'});assert r.status_code==201,r.text
    plan=c.post(f'/api/adaptive-plans/{ch}',headers=h,json={'target_minutes':3}).json()
    assert plan['items'][0]['exercise_id']==cards['exercise_id'] and plan['items'][0]['difficulty_params']['preferred_stimulus_keys']==[concept]
    for _ in range(3):card_session(c,h,ch,cards)
    with connect() as db:
        assert db.execute('SELECT status FROM vocabulary_repetitions WHERE child_id=? AND concept_id=?',(ch,concept)).fetchone()['status']=='return_scene'
        db.execute('UPDATE vocabulary_repetitions SET last_practiced_at=? WHERE child_id=? AND concept_id=?',((datetime.now(timezone.utc)-timedelta(hours=25)).isoformat(),ch,concept))
    first=c.post(f'/api/adaptive-plans/{ch}',headers=h,json={'target_minutes':3}).json()['items'][0]
    assert first['exercise_id']==scene['exercise_id'] and first['difficulty_params']['preferred_stimulus_keys']==[LOCATIONS[location]['key']+'-'+concept]
    assert first['difficulty_params']['word_concept_ids']==[concept]

def test_additive_card_mapping_keeps_goal_progress_and_an_already_started_plan(client,admin_headers,parent_headers,isolated_database):
    c=client;h=parent_headers;ch=child(c,h)
    scenes=[publish(c,admin_headers,'explore-'+s['key']) for s in LOCATIONS[:2]]
    goal=c.post('/api/practice-goals',headers=h,json={'child_id':ch,'template_key':'understand-words-in-scenes','baseline':'Synthetic existing plan','help_level':'minimal'}).json()
    with connect() as db:
        old=[t for t in goal['matching_targets'] if t not in TARGETS]
        db.execute('UPDATE parent_practice_goals SET matching_targets_json=? WHERE id=?',(json.dumps(old),goal['id']))
        db.execute("UPDATE parent_practice_goals SET status='paused' WHERE child_id=? AND id<>?",(ch,goal['id']))
    c.put(f'/api/practice-preferences/{ch}',headers=h,json={'preferred_exercise_ids':[s['exercise_id'] for s in scenes]}).raise_for_status()
    plan=c.post(f'/api/adaptive-plans/{ch}',headers=h,json={'target_minutes':3}).json()
    assert {i['exercise_id'] for i in plan['items']}=={s['exercise_id'] for s in scenes}
    learning=c.post('/api/learning-sessions',headers=h,json={'child_id':ch,'exercise_ids':[i['exercise_id'] for i in plan['items']],'adaptive_plan_id':plan['id'],'target_minutes':3}).json()
    s=c.post(f'/api/exploration/{ch}/runs',headers=h,json={'exercise_id':plan['items'][0]['exercise_id'],'learning_session_id':learning['id']}).json()
    for _ in range(4):
        obj=target(s);s,_=send(c,h,s,'audio',audio_success=True);s,_=send(c,h,s,'select',point=obj['hit_point']);s,_=send(c,h,s,'next')
    r=c.post('/api/sessions',headers=h,json={'event_id':str(uuid4()),'child_id':ch,'exercise_id':s['exercise_id'],'module':'sensory','score':0,'duration_seconds':20,'actor_role':'parent','response_owner':'child','support_context':'independent','learning_session_id':learning['id'],'details':s['details']});assert r.status_code==201,r.text
    before=next(g for g in c.get(f'/api/practice-goals/{ch}',headers=h).json() if g['id']==goal['id'])
    with connect() as db:
        _migration_35_scene_word_reinforcement(db)
        histories=db.execute('SELECT COUNT(*) n FROM practice_goal_history WHERE goal_id=?',(goal['id'],)).fetchone()['n']
        _migration_35_scene_word_reinforcement(db)
        assert db.execute('SELECT COUNT(*) n FROM practice_goal_history WHERE goal_id=?',(goal['id'],)).fetchone()['n']==histories
    after=next(g for g in c.get(f'/api/practice-goals/{ch}',headers=h).json() if g['id']==goal['id'])
    assert after['version']==before['version'] and after['progress']==before['progress'] and after['progress']['rounds']==4
    assert set(TARGETS)<=set(after['matching_targets'])
    continued=c.post(f'/api/exploration/{ch}/runs',headers=h,json={'exercise_id':plan['items'][1]['exercise_id'],'learning_session_id':learning['id']})
    assert continued.status_code==200,continued.text

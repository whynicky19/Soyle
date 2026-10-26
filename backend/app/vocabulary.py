"""Shared word evidence and conservative, inspectable practice decisions."""
import json
from datetime import datetime,timedelta,timezone
from .database import now_iso

DEFAULT_POLICY={'min_observations':3,'difficulty_observations':2,'recovery_independent':3,'recent_window':6,'cooldown_hours':24}
RULES_VERSION='vocabulary-1'

def policy_for(db,child_id):
    row=db.execute('SELECT settings_json FROM vocabulary_policies WHERE child_id=?',(child_id,)).fetchone()
    return {**DEFAULT_POLICY,**(json.loads(row['settings_json']) if row else {})}


def sync_concept_links(db):
    """Only curated equal labels (and explicit aliases) link concepts; never fuzzy-match."""
    rows=db.execute('SELECT id,label FROM word_concepts').fetchall()
    concepts={r['label'].casefold():r['id'] for r in rows}
    concept_labels={r['id']:r['label'].casefold() for r in rows}
    for row in db.execute("SELECT id,content_json FROM exercise_versions WHERE mechanic='auditory_choice'").fetchall():
        for item in json.loads(row['content_json']).get('stimuli',[]):
            label=str(item.get('label','')).casefold()
            explicit=item.get('word_concept_id')
            concept=explicit if explicit and concept_labels.get(explicit)==label else concepts.get(label) if not explicit else None
            if concept:
                db.execute('INSERT INTO word_concept_stimuli(concept_id,version_id,stimulus_key) VALUES(?,?,?) ON CONFLICT(version_id,stimulus_key) DO NOTHING',(concept,row['id'],item['key']))
    from .exercise_engine import published_exercise_rows
    published={e['engine']['version_id'] for e in published_exercise_rows(db)}
    linked={r['concept_id'] for r in db.execute('SELECT concept_id,version_id FROM word_concept_stimuli').fetchall() if r['version_id'] in published}
    for concept in concepts.values():
        available=concept in linked
        note='Есть опубликованные карточки для слухового выбора; слово доступно для закрепления в плане.' if available else 'Нужны проверенные отдельные изображения и отвлекающие варианты для слухового выбора. Автоматическая публикация запрещена.'
        db.execute("INSERT INTO vocabulary_content_gaps(concept_id,status,note,updated_at) VALUES(?,?,?,?) ON CONFLICT(concept_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at",(concept,'available' if available else 'draft',note,now_iso()))


def observe(db,*,child_id,concept_id,source_key,position,context,outcome,first_correct,errors=0,repeats=0,hint_level=0,responses=None,supports=None,run_id=None,session_id=None):
    db.execute('INSERT INTO vocabulary_policies(child_id,settings_json,updated_at) VALUES(?,?,?) ON CONFLICT(child_id) DO NOTHING',(child_id,json.dumps(DEFAULT_POLICY),now_iso()))
    db.execute('UPDATE vocabulary_policies SET settings_json=settings_json WHERE child_id=?',(child_id,))
    db.execute('''INSERT INTO word_observations(child_id,concept_id,source_key,position,context,outcome,first_correct,errors,repeats,hint_level,responses_json,supports_json,run_id,session_id,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(child_id,source_key,position) DO UPDATE SET
       outcome=excluded.outcome,first_correct=excluded.first_correct,errors=excluded.errors,repeats=excluded.repeats,
       hint_level=excluded.hint_level,responses_json=excluded.responses_json,supports_json=excluded.supports_json''',
       (child_id,concept_id,source_key,position,context,outcome,int(first_correct),errors,repeats,hint_level,json.dumps(responses or []),json.dumps(supports or []),run_id,session_id,now_iso()))
    if outcome!='incomplete':update_queue(db,child_id,concept_id)


def update_queue(db,child_id,concept_id):
    p=policy_for(db,child_id)
    cutoff=(datetime.now(timezone.utc)-timedelta(days=45)).isoformat()
    rows=[dict(r) for r in db.execute("SELECT * FROM word_observations WHERE child_id=? AND concept_id=? AND outcome<>'incomplete' AND created_at>=? ORDER BY id DESC LIMIT 60",(child_id,concept_id,cutoff)).fetchall()]
    # Multiple trials of the same word in one card game are one observation for decisions.
    recent=[];seen=set()
    for row in rows:
        if row['source_key'] in seen:continue
        seen.add(row['source_key']);recent.append(row)
    window=recent[:p['recent_window']]
    difficult=[r for r in window if r['outcome']!='independent' or r['errors']]
    queue=db.execute('SELECT * FROM vocabulary_repetitions WHERE child_id=? AND concept_id=?',(child_id,concept_id)).fetchone()
    status=queue['status'] if queue else None;reason=None
    if queue and queue['updated_at']<cutoff:
        db.execute("UPDATE vocabulary_repetitions SET status='observing' WHERE child_id=? AND concept_id=?",(child_id,concept_id));status='observing'
    if status=='reinforce':
        card=[]
        for r in recent:
            if r['created_at']<=queue['queued_at']:break
            if r['context']=='card':card.append(r)
        if len(card)>=p['recovery_independent'] and all(r['outcome']=='independent' and not r['errors'] for r in card[:p['recovery_independent']]):
            status='return_scene';reason=f"{p['recovery_independent']} самостоятельные пробы в разных карточных сессиях; предложить проверку слова на сцене."
    elif status=='return_scene':
        checks=[r for r in recent if r['context']=='scene' and r['created_at']>queue['updated_at']]
        if len(checks)>=2 and all(r['outcome']=='independent' and not r['errors'] for r in checks[:2]):status='monitoring';reason='Две последние пробы на сцене самостоятельные; специальное закрепление приостановлено.'
        elif len(checks)>=p['min_observations'] and sum(r['outcome']!='independent' or bool(r['errors']) for r in checks[:p['recent_window']])>=p['difficulty_observations']:status='reinforce';reason='После возвращения в сцену затруднение повторилось в нескольких практиках; снова предложить карточки.'
    if status not in {'reinforce','return_scene'} and len(window)>=p['min_observations'] and len(difficult)>=p['difficulty_observations']:
        status='reinforce';reason=f"В {len(difficult)} из {len(window)} разных практик понадобились помощь или исправления. Один промах не запускает закрепление."
    if reason:
        db.execute('''INSERT INTO vocabulary_repetitions(child_id,concept_id,status,reason,rules_version,queued_at,updated_at) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(child_id,concept_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,rules_version=excluded.rules_version,
          queued_at=CASE WHEN excluded.status='reinforce' AND vocabulary_repetitions.status<>'reinforce' THEN excluded.queued_at ELSE vocabulary_repetitions.queued_at END,updated_at=excluded.updated_at''',
          (child_id,concept_id,status,reason,RULES_VERSION,now_iso(),now_iso()))


def focus_for_exercise(db,child_id,exercise):
    p=policy_for(db,child_id);cutoff=(datetime.now(timezone.utc)-timedelta(hours=p['cooldown_hours'])).isoformat()
    fresh=(datetime.now(timezone.utc)-timedelta(days=45)).isoformat()
    queued=[dict(r) for r in db.execute("SELECT * FROM vocabulary_repetitions WHERE child_id=? AND status IN ('reinforce','return_scene') AND updated_at>=? AND (last_practiced_at IS NULL OR last_practiced_at<=?) ORDER BY queued_at,concept_id",(child_id,fresh,cutoff)).fetchall()]
    engine=exercise['engine'];version=engine['version_id'];keys=[];concepts=[];messages=[]
    if engine['mechanic']=='auditory_choice':
        links={r['concept_id']:r['stimulus_key'] for r in db.execute('SELECT concept_id,stimulus_key FROM word_concept_stimuli WHERE version_id=?',(version,)).fetchall()}
        for q in queued:
            if q['status']=='reinforce' and q['concept_id'] in links:
                keys.append(links[q['concept_id']]);concepts.append(q['concept_id']);messages.append(q['reason'])
    elif engine['mechanic']=='scene_search':
        links={o['concept_id']:o['id'] for o in engine['content']['exploration']['objects']}
        for q in queued:
            if q['status']=='return_scene' and q['concept_id'] in links:
                keys.append(links[q['concept_id']]);concepts.append(q['concept_id']);messages.append(q['reason'])
    return {'preferred_stimulus_keys':keys[:2],'word_concept_ids':concepts[:2],'vocabulary_reason':messages[:2],'vocabulary_rules_version':RULES_VERSION,'vocabulary_policy':p}


def ingest_card_session(db,row,exercise):
    from .practice_results import measured_result,verified_outcomes
    row=dict(row)
    if exercise['engine']['mechanic']!='auditory_choice' or not measured_result(row) or not verified_outcomes(row):return
    details=json.loads(row['details'])
    if details.get('exercise_version_id') not in (None,exercise['engine']['version_id']):return
    links={r['stimulus_key']:r['concept_id'] for r in db.execute('SELECT stimulus_key,concept_id FROM word_concept_stimuli WHERE version_id=?',(exercise['engine']['version_id'],)).fetchall()}
    for index,outcome in enumerate(details.get('round_outcomes',[])):
        concept=links.get(outcome.get('target_key'))
        if not concept or type(outcome.get('attempts')) is not int or not 1<=outcome['attempts']<=1000 or not isinstance(outcome.get('supports'),list):continue
        if outcome['outcome']=='independent' and (outcome['attempts']!=1 or outcome['supports'] or outcome.get('selected_key')!=outcome.get('target_key')):continue
        supports=outcome.get('supports',[])
        hint_level=2 if any(s in supports for s in ('reduced_choice','model_answer')) else int('visual_hint' in supports)
        observe(db,child_id=row['child_id'],concept_id=concept,source_key='card:'+str(row['id']),position=index,context='card',outcome=outcome['outcome'],first_correct=outcome.get('first_response')==outcome.get('target_key'),errors=max(0,int(outcome.get('attempts',1))-int(outcome['outcome']!='modelled')),repeats=supports.count('repeat_audio'),hint_level=hint_level,responses=[outcome.get('selected_key')],supports=supports,session_id=row['id'])
        db.execute('UPDATE vocabulary_repetitions SET last_practiced_at=? WHERE child_id=? AND concept_id=?',(now_iso(),row['child_id'],concept))


def vocabulary_summary(db,child_id):
    from .exercise_engine import published_exercise_rows
    available={e['engine']['version_id']:e for e in published_exercise_rows(db) if e['engine']['mechanic']=='auditory_choice'}
    links={}
    for row in db.execute('SELECT * FROM word_concept_stimuli').fetchall():
        if row['version_id'] in available:links.setdefault(row['concept_id'],[]).append({'exercise_id':available[row['version_id']]['id'],'title':available[row['version_id']]['title'],'stimulus_key':row['stimulus_key']})
    rows=[dict(r) for r in db.execute('SELECT o.*,c.label FROM word_observations o JOIN word_concepts c ON c.id=o.concept_id WHERE o.child_id=? ORDER BY o.id DESC',(child_id,)).fetchall()]
    by={}
    for row in rows:by.setdefault(row['concept_id'],[]).append(row)
    queues={r['concept_id']:dict(r) for r in db.execute('SELECT * FROM vocabulary_repetitions WHERE child_id=?',(child_id,)).fetchall()}
    words=[]
    for concept,items in by.items():
        valid=[r for r in items if r['outcome']!='incomplete'];q=queues.get(concept)
        if q and q['updated_at']<(datetime.now(timezone.utc)-timedelta(days=45)).isoformat():q=None
        words.append(dict(concept_id=concept,label=items[0]['label'],independent=sum(r['outcome']=='independent' for r in valid),with_help=sum(r['outcome'] in {'prompted','modelled'} for r in valid),first_correct=sum(r['first_correct'] for r in valid),observations=len(valid),unfinished=sum(r['outcome']=='incomplete' for r in items),status=q['status'] if q else 'observing',reason=q['reason'] if q else 'Для решения о закреплении нужны несколько наблюдений.',card_exercises=links.get(concept,[]),content_pending=not bool(links.get(concept)),history=[{**{k:r[k] for k in ['context','outcome','first_correct','errors','repeats','hint_level','created_at']},'responses':json.loads(r['responses_json']),'supports':json.loads(r['supports_json'])} for r in items[:20]]))
    return dict(words=words,policy=policy_for(db,child_id),rules_version=RULES_VERSION,note='Это результаты конкретных игровых проб. Контексты сцены и карточек учитываются отдельно. Решения о закреплении используют пробы за последние 45 дней; медицинские выводы не делаются.')

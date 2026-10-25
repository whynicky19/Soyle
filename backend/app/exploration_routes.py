"""Routes reuse Soyle's existing authorization, consent and publication boundaries."""
import json
from fastapi import Depends,HTTPException,Query
from .database import connect,now_iso
from .security import require_roles
from .schemas import ExplorationStart,ExplorationPreviewStart,ExplorationEvent,VocabularyPolicyUpdate
from .exercise_engine import get_version,published_exercise
from .practice_goals import get_preferences
from .exploration import start_run,snapshot,apply_event
from .vocabulary import vocabulary_summary


def register_exploration_routes(app,ensure_child_access,ensure_privacy_consent):
    def playable(db,exercise_id,child_id):
        exercise=published_exercise(db,exercise_id)
        if not exercise or exercise['engine']['mechanic']!='scene_search':raise HTTPException(404,'Эта локация ещё не опубликована')
        if exercise_id in get_preferences(db,child_id)['avoided_exercise_ids']:raise HTTPException(409,'Родитель исключил эту локацию из практики')
        return exercise
    def owned_run(db,run_id,user,write=False):
        row=db.execute('SELECT * FROM exploration_runs WHERE id=?',(run_id,)).fetchone()
        if not row:raise HTTPException(404,'Серия не найдена')
        if row['child_id'] is None:
            if user['role'] not in {'admin','parent'} or row['preview_owner']!=user['id']:raise HTTPException(403,'Это предпросмотр другого взрослого')
        else:
            ensure_child_access(row['child_id'],user);ensure_privacy_consent(row['child_id'])
            if write and user['role'] not in {'parent','student'}:raise HTTPException(403,'Для администратора доступен отдельный предпросмотр')
            version=get_version(db,row['version_id']);exercise=playable(db,version['exercise_id'],row['child_id'])
            if exercise['engine']['version_id']!=row['version_id']:raise HTTPException(409,'Локация обновлена. Откройте новую серию.')
        return row

    @app.post('/api/exploration/{child_id}/runs')
    def begin(child_id:int,payload:ExplorationStart,user:dict=Depends(require_roles('parent','student'))):
        ensure_child_access(child_id,user);ensure_privacy_consent(child_id)
        with connect() as db:
            exercise=playable(db,payload.exercise_id,child_id)
            if payload.learning_session_id:
                learning=db.execute('SELECT * FROM learning_sessions WHERE id=? AND child_id=?',(payload.learning_session_id,child_id)).fetchone()
                if not learning or learning['status']!='in_progress' or payload.exercise_id not in json.loads(learning['exercise_ids']):raise HTTPException(409,'Продолжите доступное занятие перед запуском локации')
                if learning['adaptive_plan_id']:
                    item=db.execute('SELECT i.*,g.version current_goal_version,g.status goal_status FROM adaptive_practice_plan_items i JOIN parent_practice_goals g ON g.id=i.goal_id WHERE i.plan_id=? AND i.exercise_id=?',(learning['adaptive_plan_id'],payload.exercise_id)).fetchone()
                    if not item or item['exercise_version_id']!=exercise['engine']['version_id'] or item['goal_version']!=item['current_goal_version'] or item['goal_status']!='active':raise HTTPException(409,'План изменился. Подготовьте новый.')
                    params=json.loads(item['difficulty_params_json']);payload=payload.model_copy(update={'level':params['difficulty_level'],'rounds':params['round_count']})
            return start_run(db,get_version(db,exercise['engine']['version_id']),child_id=child_id,level=payload.level,rounds=payload.rounds,accessible_labels=payload.accessible_labels,learning_session_id=payload.learning_session_id)

    @app.get('/api/exploration/{child_id}/active')
    def active(child_id:int,exercise_id:int,learning_session_id:int|None=None,user:dict=Depends(require_roles('parent','student'))):
        ensure_child_access(child_id,user);ensure_privacy_consent(child_id)
        with connect() as db:
            exercise=playable(db,exercise_id,child_id)
            query='SELECT * FROM exploration_runs WHERE child_id=? AND version_id=? AND '
            args=[child_id,exercise['engine']['version_id']]
            if learning_session_id is None:query+='learning_session_id IS NULL '
            else:query+='learning_session_id=? ';args.append(learning_session_id)
            for row in db.execute(query+'ORDER BY updated_at DESC LIMIT 10',tuple(args)).fetchall():
                state=json.loads(row['state_json'])
                completed_saved=db.execute('SELECT session_id FROM exploration_submissions WHERE run_id=?',(row['id'],)).fetchone()
                if state['status'] in {'active','paused'} or state['status'] in {'completed','refused','technical_error'} and not completed_saved:return snapshot(db,row)
            return None

    @app.post('/api/exploration/previews/{version_id}')
    def preview(version_id:int,payload:ExplorationPreviewStart,user:dict=Depends(require_roles('admin','parent'))):
        with connect() as db:
            version=get_version(db,version_id)
            if version['mechanic']!='scene_search':raise HTTPException(422,'Эта версия использует другой проигрыватель')
            if user['role']!='admin':
                exercise=published_exercise(db,version['exercise_id'])
                if not exercise or exercise['engine']['version_id']!=version_id:raise HTTPException(403,'Черновик доступен только администратору')
            # Preview rows have no child_id, create no word evidence and cannot be credited.
            db.execute('DELETE FROM exploration_runs WHERE preview_owner=? AND child_id IS NULL',(user['id'],))
            return start_run(db,version,preview_owner=user['id'],level=payload.level,rounds=payload.rounds,accessible_labels=payload.accessible_labels)

    @app.get('/api/exploration/runs/{run_id}')
    def read_run(run_id:str,user:dict=Depends(require_roles('admin','parent','student'))):
        with connect() as db:return snapshot(db,owned_run(db,run_id,user))

    @app.post('/api/exploration/runs/{run_id}/events')
    def event(run_id:str,payload:ExplorationEvent,user:dict=Depends(require_roles('admin','parent','student'))):
        with connect() as db:return apply_event(db,owned_run(db,run_id,user,write=True),payload)

    @app.delete('/api/exploration/previews/{run_id}',status_code=204)
    def close_preview(run_id:str,user:dict=Depends(require_roles('admin','parent'))):
        with connect() as db:
            run=owned_run(db,run_id,user)
            if run['child_id'] is not None:raise HTTPException(403,'Удалить можно только собственный предпросмотр')
            db.execute('DELETE FROM exploration_runs WHERE id=?',(run_id,))

    @app.get('/api/admin/vocabulary-content-gaps')
    def content_gaps(user:dict=Depends(require_roles('admin'))):
        with connect() as db:
            return [dict(r) for r in db.execute('SELECT g.*,c.label FROM vocabulary_content_gaps g JOIN word_concepts c ON c.id=g.concept_id ORDER BY c.label').fetchall()]

    @app.get('/api/vocabulary/{child_id}')
    def summary(child_id:int,user:dict=Depends(require_roles('admin','parent','specialist'))):
        ensure_child_access(child_id,user)
        with connect() as db:return vocabulary_summary(db,child_id)

    @app.patch('/api/vocabulary/{child_id}/policy')
    def update_policy(child_id:int,payload:VocabularyPolicyUpdate,user:dict=Depends(require_roles('admin','specialist'))):
        ensure_child_access(child_id,user)
        if payload.recent_window<payload.min_observations or payload.difficulty_observations>payload.min_observations:raise HTTPException(422,'Порог трудностей не должен превышать минимум наблюдений, а окно должно вмещать этот минимум')
        with connect() as db:
            db.execute('INSERT INTO vocabulary_policies(child_id,settings_json,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(child_id) DO UPDATE SET settings_json=excluded.settings_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at',(child_id,json.dumps(payload.model_dump()),user['id'],now_iso()))
            return vocabulary_summary(db,child_id)

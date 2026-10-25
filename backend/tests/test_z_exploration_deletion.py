from uuid import uuid4
from app.database import connect
from app.exploration_content import LOCATIONS,draft_for_location
from test_privacy_specialist import family,consent


def test_delete_family_with_plan_scene_events_and_words_preserves_other_family(client,admin_headers):
    c=client
    owner,h,child=family(c)
    other,other_h,other_child=family(c)
    consent(c,h,child,False)
    draft=c.post('/api/admin/exercise-drafts',headers=admin_headers,json=draft_for_location(LOCATIONS[0]))
    assert draft.status_code==201,draft.text
    version=draft.json()['version'];exercise=version['exercise_id']
    with connect() as db:
        db.execute('UPDATE exercises SET target=? WHERE id=?',('explore-bedroom',exercise))
    assert c.post(f'/api/admin/exercise-drafts/{version["id"]}/publish',headers=admin_headers).status_code==200
    try:
        goal=c.post('/api/practice-goals',headers=h,json={'child_id':child,'template_key':'understand-words-in-scenes','baseline':'Synthetic deletion test','help_level':'minimal'})
        assert goal.status_code==201,goal.text
        assert c.put(f'/api/practice-preferences/{child}',headers=h,json={'preferred_exercise_ids':[exercise]}).status_code==200
        plan=c.post(f'/api/adaptive-plans/{child}',headers=h,json={'target_minutes':3}).json()
        assert plan['items'][0]['exercise_id']==exercise
        learning=c.post('/api/learning-sessions',headers=h,json={'child_id':child,'exercise_ids':[i['exercise_id'] for i in plan['items']],'adaptive_plan_id':plan['id'],'target_minutes':3}).json()
        s=c.post(f'/api/exploration/{child}/runs',headers=h,json={'exercise_id':exercise,'learning_session_id':learning['id']}).json()
        def event(action,**extra):
            nonlocal s
            response=c.post(f'/api/exploration/runs/{s["id"]}/events',headers=h,json={'action':action,'event_id':str(uuid4()),'expected_revision':s['revision'],**extra})
            assert response.status_code==200,response.text
            s=response.json()
        event('audio',audio_success=True)
        target=next(o for o in s['scene']['objects'] if o['id']==s['state']['order'][0])
        event('select',point=target['hit_point']);event('pause')
        saved=c.post('/api/sessions',headers=h,json={'event_id':str(uuid4()),'child_id':child,'exercise_id':exercise,'module':'sensory','score':0,'duration_seconds':12,'actor_role':'parent','response_owner':'child','support_context':'independent','learning_session_id':learning['id'],'details':s['details']})
        assert saved.status_code==201,saved.text
        with connect() as db:
            assert db.execute('SELECT COUNT(*) n FROM word_observations WHERE child_id=?',(child,)).fetchone()['n']==1
        assert c.request('DELETE','/api/auth/account',headers=h,json={'password':'PrivacyTest123!'}).status_code==204
        with connect() as db:
            for table in ['children','sessions','learning_sessions','parent_practice_goals','adaptive_practice_plans','exploration_runs','word_observations','vocabulary_policies','vocabulary_repetitions']:
                column='id' if table=='children' else 'child_id'
                assert db.execute(f'SELECT COUNT(*) n FROM {table} WHERE {column}=?',(child,)).fetchone()['n']==0
            assert not db.execute('SELECT id FROM users WHERE id=?',(owner['id'],)).fetchone()
            assert not db.execute('SELECT run_id FROM exploration_events WHERE run_id=?',(s['id'],)).fetchone()
            assert not db.execute('SELECT run_id FROM exploration_submissions WHERE run_id=?',(s['id'],)).fetchone()
        assert c.get('/api/children',headers=other_h).json()[0]['id']==other_child
        assert c.get('/api/auth/me',headers=other_h).json()['id']==other['id']
    finally:
        c.delete(f'/api/admin/exercises/{exercise}',headers=admin_headers)
        if c.get('/api/auth/me',headers=h).status_code==200:c.request('DELETE','/api/auth/account',headers=h,json={'password':'PrivacyTest123!'})
        assert c.request('DELETE','/api/auth/account',headers=other_h,json={'password':'PrivacyTest123!'}).status_code==204

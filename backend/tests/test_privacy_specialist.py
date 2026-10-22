from uuid import uuid4
from app.database import connect, now_iso


def register(client, prefix):
    username = prefix + uuid4().hex[:10]
    result = client.post('/api/auth/register', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': username, 'password': 'PrivacyTest123!', 'full_name': 'Тестовый взрослый'})
    assert result.status_code == 201, result.text
    return result.json()['user'], {'Authorization': f"Bearer {result.json()['access_token']}"}


def family(client):
    user, headers = register(client, 'privacy')
    response = client.post('/api/children', headers=headers, json={'name': 'Тестовый профиль', 'birth_date': '2020-01-01'})
    assert response.status_code == 201, response.text
    return user, headers, response.json()['id']


def consent(client, headers, child_id, sharing):
    response = client.put(f'/api/children/{child_id}/consent', headers=headers, json={'privacy_accepted': True, 'specialist_sharing': sharing})
    assert response.status_code == 200, response.text


def test_specialist_requires_explicit_grant_and_revocation_is_immediate(client, admin_headers):
    parent, headers, child = family(client)
    _, other_headers, other_child = family(client)
    specialist, old_headers = register(client, 'specialist')
    changed = client.patch(f"/api/admin/users/{specialist['id']}/role", headers=admin_headers, json={'role': 'specialist'})
    assert changed.status_code == 200, changed.text
    assert client.get('/api/auth/me', headers=old_headers).status_code == 401
    login = client.post('/api/auth/login', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': specialist['username'], 'password': 'PrivacyTest123!'})
    assert login.status_code == 200, login.text
    spec = {'Authorization': f"Bearer {login.json()['access_token']}"}
    assert client.get('/api/children', headers=spec).json() == []
    path = f'/api/children/{child}/specialists'
    consent(client, headers, child, False)
    assert client.post(path, headers=headers, json={'username': specialist['username']}).status_code == 403
    consent(client, headers, child, True)
    assert client.post(path, headers=other_headers, json={'username': specialist['username']}).status_code == 403
    assert client.post(path, headers=headers, json={'username': specialist['username']}).status_code == 201
    assert [item['id'] for item in client.get('/api/children', headers=spec).json()] == [child]
    workspace = client.get(f'/api/specialist/children/{child}', headers=spec)
    assert workspace.status_code == 200, workspace.text
    before = workspace.json()['dashboard']['total_sessions']
    assert client.get(f'/api/specialist/children/{other_child}', headers=spec).status_code == 403
    from app import exercise_engine
    demo_permission = exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT
    try:
        exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT = False
        exercise_id = workspace.json()['available_exercises'][0]['id']
        unavailable = client.post('/api/specialist/recommendations', headers=spec, json={'child_id': child, 'exercise_id': exercise_id, 'suggested_skill': 'communication', 'comment': 'Материал ещё не проверен'})
        assert unavailable.status_code == 404
    finally:
        exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT = demo_permission
    for private in [f'/api/children/{child}/export', f'/api/children/{child}/consent', '/api/admin/users']:
        assert client.get(private, headers=spec).status_code == 403
    invalid = client.post(f'/api/specialist/children/{child}/observations', headers=spec, json={'result_type': 'independent', 'prompt_level': 'full', 'context': 'За столом дома', 'note': 'Ответ после показа'})
    assert invalid.status_code == 422
    note = client.post(f'/api/specialist/children/{child}/observations', headers=spec, json={'result_type': 'with_help', 'prompt_level': 'minimal', 'context': 'За столом дома', 'note': 'Попросил воду после жеста взрослого'})
    assert note.status_code == 201, note.text
    assert note.json()['source'] == 'specialist_real_life_observation'
    assert client.get(f'/api/specialist/children/{child}', headers=spec).json()['dashboard']['total_sessions'] == before
    assert client.get(f'/api/children/{child}/specialist-observations', headers=headers).json()[0]['id'] == note.json()['id']
    advice = client.post('/api/specialist/recommendations', headers=spec, json={'child_id': child, 'suggested_skill': 'communication', 'comment': 'Предлагать выбор из двух знакомых предметов'})
    assert advice.status_code == 201, advice.text
    current_advice = client.get(f'/api/children/{child}/specialist-recommendations', headers=headers).json()[0]
    assert current_advice['id'] == advice.json()['id']
    assert current_advice['is_current'] is True
    assert current_advice['exercise_available'] is False
    attached = client.post('/api/specialist/recommendations', headers=spec, json={'child_id': child, 'exercise_id': workspace.json()['available_exercises'][0]['id'], 'suggested_skill': 'communication', 'comment': 'Попробуйте короткое задание вместе'})
    assert attached.status_code == 201, attached.text
    assert client.get(f'/api/children/{child}/specialist-recommendations', headers=headers).json()[0]['exercise_available'] is True
    try:
        exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT = False
        unavailable_advice = client.get(f'/api/children/{child}/specialist-recommendations', headers=headers).json()[0]
        assert unavailable_advice['is_current'] is True
        assert unavailable_advice['exercise_available'] is False
    finally:
        exercise_engine.ALLOW_UNREVIEWED_DEMO_CONTENT = demo_permission
    assert client.delete(f"{path}/{specialist['id']}", headers=headers).status_code == 204
    assert client.get(f'/api/specialist/children/{child}', headers=spec).status_code == 403
    assert client.get(f'/api/children/{child}/specialist-recommendations', headers=headers).json()[0]["is_current"] is False
    assert client.post(path, headers=headers, json={'username': specialist['username']}).status_code == 201
    consent(client, headers, child, False)
    consent(client, headers, child, True)
    assert client.get('/api/children', headers=spec).json() == []
    assert client.post(f'/api/specialist/children/{child}/observations', headers=spec, json={'result_type': 'refused', 'prompt_level': 'independent', 'context': 'Дома', 'note': 'Не захотел продолжать'}).status_code == 403
    assert client.request('DELETE', '/api/auth/account', headers=headers, json={'password': 'PrivacyTest123!'}).status_code == 204
    assert client.request('DELETE', '/api/auth/account', headers=other_headers, json={'password': 'PrivacyTest123!'}).status_code == 204


def test_account_deletion_scrubs_orphans_and_invalidates_both_logins(client):
    parent, headers, child = family(client)
    _, survivor_headers, survivor_child = family(client)
    account = client.post(f'/api/children/{child}/student-account', headers=headers, json={'username': 'delete' + uuid4().hex[:10], 'pin': '1234'}).json()
    login = client.post('/api/auth/student-login', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': account['username'], 'pin': '1234'})
    assert login.status_code == 200, login.text
    student_headers = {'Authorization': f"Bearer {login.json()['access_token']}"}
    settings = {'camera_enabled': False, 'sound_enabled': True, 'calm_mode': False, 'theme': 'peach', 'language': 'ru'}
    for auth in [headers, student_headers]:
        assert client.put('/api/settings', headers=auth, json=settings).status_code == 200
    with connect() as db:
        for actor in [f"user:{parent['id']}", f"student:{account['id']}", 'user:1']:
            db.execute('INSERT INTO audit_events(actor_key,action,object_type,object_id,metadata,created_at) VALUES(?,?,?,?,?,?)', (actor, 'test', 'child', str(child), '{}', now_iso()))
    assert client.request('DELETE', '/api/auth/account', headers=headers, json={'password': 'Wrong123!'}).status_code == 403
    assert client.get('/api/auth/me', headers=headers).status_code == 200
    assert client.request('DELETE', '/api/auth/account', headers=headers, json={'password': 'PrivacyTest123!'}).status_code == 204
    assert client.get('/api/auth/me', headers=headers).status_code == 401
    assert client.get('/api/auth/me', headers=student_headers).status_code == 401
    with connect() as db:
        assert not db.execute('SELECT id FROM users WHERE id=?', (parent['id'],)).fetchone()
        assert not db.execute('SELECT id FROM children WHERE id=?', (child,)).fetchone()
        assert not db.execute('SELECT id FROM student_accounts WHERE id=?', (account['id'],)).fetchone()
        for key in [f"user:{parent['id']}", f"student:{account['id']}"]:
            assert not db.execute('SELECT user_key FROM user_settings WHERE user_key=?', (key,)).fetchone()
            assert not db.execute('SELECT id FROM audit_events WHERE actor_key=?', (key,)).fetchone()
        assert not db.execute("SELECT id FROM audit_events WHERE object_type='child' AND object_id=?", (str(child),)).fetchone()
        assert db.execute('SELECT id FROM children WHERE id=?', (survivor_child,)).fetchone()
    assert client.get('/api/auth/me', headers=survivor_headers).status_code == 200
    assert client.request('DELETE', '/api/auth/account', headers=survivor_headers, json={'password': 'PrivacyTest123!'}).status_code == 204


def test_privacy_reports_missing_facts_without_invented_operator(client, monkeypatch):
    for name in ['SOYLE_OPERATOR_NAME', 'SOYLE_OPERATOR_COUNTRY', 'SOYLE_PRIVACY_CONTACT_EMAIL', 'SOYLE_HOSTING_LOCATION', 'SOYLE_HISTORY_RETENTION_POLICY', 'SOYLE_BACKUP_RETENTION_POLICY', 'SOYLE_DELETION_REQUEST_POLICY']:
        monkeypatch.delenv(name, raising=False)
    profile = client.get('/api/privacy').json()
    assert profile['status'] == 'mvp'
    assert profile['operator_name'] is None
    assert profile['legal_review_verified'] is False
    assert len(profile['missing']) == 7
    monkeypatch.setenv('SOYLE_OPERATOR_NAME', 'Оператор тестового стенда')
    assert client.get('/api/privacy').json()['operator_name'] == 'Оператор тестового стенда'
    assert not client.get('/api/privacy').json()['operator_configured']

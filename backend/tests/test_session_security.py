import jwt
from fastapi.testclient import TestClient
from app.main import app
from app.database import connect
from app.security import SECRET_KEY


def login(browser):
    response = browser.post('/api/auth/login', json={'username': 'parent', 'password': 'Parent123!'})
    assert response.status_code == 200
    return browser.cookies.get('soyle_access')


def test_logout_revokes_only_that_login_and_rejects_replay(client):
    with TestClient(app) as first, TestClient(app) as second:
        token = login(first)
        other = login(second)
        assert token != other
        assert first.post('/api/auth/logout', headers={'X-CSRF-Token': first.cookies.get('soyle_csrf')}).status_code == 204
        assert client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'}).status_code == 401
        assert second.get('/api/auth/me').status_code == 200
        legacy = jwt.encode({'sub': jwt.decode(other, SECRET_KEY, algorithms=['HS256'])['sub'], 'exp': 9999999999}, SECRET_KEY, algorithm='HS256')
        assert client.get('/api/auth/me', headers={'Authorization': f'Bearer {legacy}'}).status_code == 401


def test_pin_reset_revokes_child_session(client, parent_headers):
    child = client.post('/api/children', headers=parent_headers, json={'name': 'Session test', 'birth_date': '2020-01-01'}).json()
    account_path = f"/api/children/{child['id']}/student-account"
    account = client.post(account_path, headers=parent_headers, json={'username': 'session-test-child', 'pin': '1234'}).json()
    try:
        response = client.post('/api/auth/student-login', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': account['username'], 'pin': '1234'})
        assert response.status_code == 200
        headers = {'Authorization': f"Bearer {response.json()['access_token']}"}
        assert client.get('/api/auth/me', headers=headers).status_code == 200
        assert client.post(account_path, headers=parent_headers, json={'username': account['username'], 'pin': '5678'}).status_code == 200
        assert client.get('/api/auth/me', headers=headers).status_code == 401
        assert client.post('/api/auth/student-login', json={'username': account['username'], 'pin': '1234'}).status_code == 401
        assert client.post('/api/auth/student-login', json={'username': account['username'], 'pin': '5678'}).status_code == 200
    finally:
        with connect() as db:
            db.execute('DELETE FROM auth_sessions WHERE subject=?', (f"student:{account['id']}",))
            db.execute('DELETE FROM children WHERE id=?', (child['id'],))


def test_account_disable_and_role_change_do_not_revive_old_sessions(client, admin_headers):
    response = client.post('/api/auth/register', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': 'session-security-test', 'password': 'SessionTest123!', 'full_name': 'Session test'})
    assert response.status_code == 201, response.text
    account_id = response.json()['user']['id']
    headers = {'Authorization': f"Bearer {response.json()['access_token']}"}
    try:
        assert client.patch(f'/api/admin/users/{account_id}/active', headers=admin_headers, json={'is_active': False}).status_code == 200
        assert client.patch(f'/api/admin/users/{account_id}/active', headers=admin_headers, json={'is_active': True}).status_code == 200
        assert client.get('/api/auth/me', headers=headers).status_code == 401
        logged_in = client.post('/api/auth/login', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': 'session-security-test', 'password': 'SessionTest123!'})
        headers = {'Authorization': f"Bearer {logged_in.json()['access_token']}"}
        assert client.patch(f'/api/admin/users/{account_id}/role', headers=admin_headers, json={'role': 'admin'}).status_code == 200
        assert client.get('/api/auth/me', headers=headers).status_code == 401
    finally:
        with connect() as db:
            db.execute('DELETE FROM auth_sessions WHERE subject=?', (str(account_id),))
            db.execute('DELETE FROM users WHERE id=?', (account_id,))

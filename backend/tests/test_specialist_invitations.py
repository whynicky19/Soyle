from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import app
from app.database import connect


def account(client, prefix, admin=None):
    username = prefix + uuid4().hex[:10]
    response = client.post('/api/auth/register', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': username, 'password': 'InviteTest123!', 'full_name': 'Проверка приглашения'})
    assert response.status_code == 201, response.text
    user = response.json()['user']
    if admin:
        assert client.patch(f"/api/admin/users/{user['id']}/role", headers=admin, json={'role': 'specialist'}).status_code == 200
        response = client.post('/api/auth/login', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': username, 'password': 'InviteTest123!'})
    return user, {'Authorization': 'Bearer ' + response.json()['access_token']}


def test_link_claim_does_not_grant_until_owner_confirms_and_is_single_use(client, admin_headers):
    _, parent = account(client, 'invfamily')
    _, outsider = account(client, 'invother')
    specialist, spec = account(client, 'invspec', admin_headers)
    _, second_spec = account(client, 'invsecond', admin_headers)
    response = client.post('/api/children', headers=parent, json={'name': 'Профиль приглашения', 'birth_date': '2020-01-01'})
    child = response.json()['id']
    path = f'/api/children/{child}/specialist-invitations'
    assert client.post(path, headers=parent).status_code == 403
    consent = {'privacy_accepted': True, 'specialist_sharing': True}
    assert client.put(f'/api/children/{child}/consent', headers=parent, json=consent).status_code == 200
    created = client.post(path, headers=parent)
    assert created.status_code == 201, created.text
    invitation = created.json()
    token = {'token': invitation['token']}
    assert len(token['token']) >= 40
    with connect() as db:
        stored = db.execute('SELECT token_hash FROM specialist_invitations WHERE id=?', (invitation['id'],)).fetchone()['token_hash']
        assert stored != token['token']
    assert client.get(path, headers=outsider).status_code == 403
    with TestClient(app) as anonymous:
        assert anonymous.post('/api/specialist-invitations/claim', json=token).status_code == 401
    assert client.post('/api/specialist-invitations/claim', headers=parent, json=token).status_code == 403
    assert client.post('/api/specialist-invitations/claim', headers=spec, json=token).json() == {'status': 'pending'}
    assert client.post('/api/specialist-invitations/claim', headers=spec, json=token).status_code == 200
    assert client.post('/api/specialist-invitations/claim', headers=second_spec, json=token).status_code == 410
    assert client.get(f'/api/specialist/children/{child}', headers=spec).status_code == 403
    listed = client.get(path, headers=parent).json()
    assert listed[0]['specialist_username'] == specialist['username']
    assert 'token' not in listed[0] and 'token_hash' not in listed[0]
    approval = f"{path}/{invitation['id']}/approve"
    assert client.post(approval, headers=outsider).status_code == 403
    assert client.post(approval, headers=parent).status_code == 200
    assert client.get(f'/api/specialist/children/{child}', headers=spec).status_code == 200
    assert client.post(approval, headers=parent).status_code == 409
    assert client.post('/api/specialist-invitations/claim', headers=spec, json=token).status_code == 410
    assert client.delete(f"/api/children/{child}/specialists/{specialist['id']}", headers=parent).status_code == 204
    assert client.get(f'/api/specialist/children/{child}', headers=spec).status_code == 403
    assert client.post(approval, headers=parent).status_code == 409
    assert client.request('DELETE', '/api/auth/account', headers=parent, json={'password': 'InviteTest123!'}).status_code == 204
    with connect() as db:
        assert not db.execute('SELECT id FROM specialist_invitations WHERE child_id=?', (child,)).fetchone()


def test_expired_cancelled_and_replaced_links_cannot_be_used(client, admin_headers):
    _, parent = account(client, 'invexpiry')
    _, spec = account(client, 'invexpSpec', admin_headers)
    child = client.post('/api/children', headers=parent, json={'name': 'Срок ссылки', 'birth_date': '2020-01-01'}).json()['id']
    consent_path = f'/api/children/{child}/consent'
    assert client.put(consent_path, headers=parent, json={'privacy_accepted': True, 'specialist_sharing': True}).status_code == 200
    path = f'/api/children/{child}/specialist-invitations'
    create = lambda: client.post(path, headers=parent).json()
    first, replacement = create(), create()
    assert client.post('/api/specialist-invitations/claim', headers=spec, json={'token': first['token']}).status_code == 410
    assert client.delete(f"{path}/{replacement['id']}", headers=parent).status_code == 204
    assert client.post('/api/specialist-invitations/claim', headers=spec, json={'token': replacement['token']}).status_code == 410
    expired = create()
    with connect() as db:
        db.execute('UPDATE specialist_invitations SET expires_at=? WHERE id=?', ('2000-01-01T00:00:00+00:00', expired['id']))
    assert client.post('/api/specialist-invitations/claim', headers=spec, json={'token': expired['token']}).status_code == 410
    pending = create()
    assert client.post('/api/specialist-invitations/claim', headers=spec, json={'token': pending['token']}).status_code == 200
    assert client.put(consent_path, headers=parent, json={'privacy_accepted': True, 'specialist_sharing': False}).status_code == 200
    assert client.put(consent_path, headers=parent, json={'privacy_accepted': True, 'specialist_sharing': True}).status_code == 200
    assert client.post(f"{path}/{pending['id']}/approve", headers=parent).status_code == 409
    assert client.post('/api/specialist-invitations/claim', headers=spec, json={'token': pending['token']}).status_code == 410
    assert client.request('DELETE', '/api/auth/account', headers=parent, json={'password': 'InviteTest123!'}).status_code == 204

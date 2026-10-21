import uuid

from app.database import connect


def open_book(client, parent_headers):
    child_id = client.get('/api/children', headers=parent_headers).json()[0]['id']
    response = client.get(f'/api/cinematic-storybooks/{child_id}/toy', headers=parent_headers)
    assert response.status_code == 200
    snapshot = response.json()
    return child_id, step(client, parent_headers, child_id, snapshot, 'restart')


def send(client, headers, child, snapshot, action, **override):
    return client.post(f'/api/cinematic-storybooks/{child}/toy/events', headers=headers, json={
        'version': 2, 'expected_revision': snapshot['revision'], 'phase': snapshot['state']['phase'],
        'action': action, 'event_id': str(uuid.uuid4()), **override,
    })


def step(client, headers, child, snapshot, action):
    response = send(client, headers, child, snapshot, action)
    assert response.status_code == 200, response.text
    return response.json()


def test_continuous_scene_checkpoints_and_version_isolation(client, parent_headers, student_headers):
    child, snapshot = open_book(client, parent_headers)
    assert snapshot['preview'] and snapshot['definition']['version'] == 2
    assert snapshot['definition']['status'] == 'DRAFT'
    assert client.get(f'/api/cinematic-storybooks/{child}/toy', headers=student_headers).status_code == 403
    assert send(client, student_headers, child, snapshot, 'advance').status_code == 403
    assert send(client, parent_headers, child, snapshot, 'request_help').status_code == 422
    for phase in ['NOTICE', 'REACH', 'AWAIT_REQUEST']:
        snapshot = step(client, parent_headers, child, snapshot, 'advance')
        assert snapshot['state']['phase'] == phase
    assert send(client, parent_headers, child, snapshot, 'advance').status_code == 422
    snapshot = step(client, parent_headers, child, snapshot, 'request_point')
    assert snapshot['state']['communication_method'] == 'point'
    for phase in ['MOTHER_ENTER', 'PICK_UP', 'TRANSFER', 'HUG', 'COMPLETE']:
        snapshot = step(client, parent_headers, child, snapshot, 'advance')
        assert snapshot['state']['phase'] == phase
    assert snapshot['state']['completed']
    persisted = client.get(f'/api/cinematic-storybooks/{child}/toy', headers=parent_headers).json()
    assert persisted == snapshot
    old = client.get(f'/api/storybooks/{child}/toy', headers=parent_headers).json()
    assert old['definition']['version'] == 1
    assert 'scene_index' in old['state'] and 'phase' not in old['state']
    assert 'score' not in snapshot['state']
    with connect() as db:
        assert db.execute('SELECT COUNT(*) count FROM child_story_progress WHERE child_id=?', (child,)).fetchone()['count'] == 0


def test_refusal_break_assistance_are_separate_and_restore_pause(client, parent_headers):
    child, snapshot = open_book(client, parent_headers)
    for _ in range(3): snapshot = step(client, parent_headers, child, snapshot, 'advance')
    snapshot = step(client, parent_headers, child, snapshot, 'refuse')
    assert snapshot['state']['phase'] == 'AWAIT_REQUEST'
    assert snapshot['state']['refusal_count'] == 1
    assert snapshot['state']['communication_method'] is None
    assert send(client, parent_headers, child, snapshot, 'request_help').status_code == 422
    snapshot = step(client, parent_headers, child, snapshot, 'resume')
    snapshot = step(client, parent_headers, child, snapshot, 'break')
    restored = client.get(f'/api/cinematic-storybooks/{child}/toy', headers=parent_headers).json()
    assert restored['state']['paused'] and restored['state']['break_count'] == 1
    snapshot = step(client, parent_headers, child, restored, 'resume')
    snapshot = step(client, parent_headers, child, snapshot, 'hint')
    snapshot = step(client, parent_headers, child, snapshot, 'assist')
    assert snapshot['state']['assistance_count'] == 1
    assert snapshot['state']['hint_count'] == 1
    assert snapshot['state']['communication_method'] is None
    assert snapshot['state']['phase'] == 'REQUEST'


def test_conflicts_delayed_retries_and_family_boundaries(client, parent_headers):
    child, first = open_book(client, parent_headers)
    event_id = str(uuid.uuid4())
    response = send(client, parent_headers, child, first, 'advance', event_id=event_id)
    snapshot = response.json()
    snapshot = step(client, parent_headers, child, snapshot, 'advance')
    retry = send(client, parent_headers, child, first, 'advance', event_id=event_id)
    assert retry.json() == snapshot
    assert send(client, parent_headers, child, first, 'advance').status_code == 409
    assert send(client, parent_headers, child, snapshot, 'advance', version=1).status_code == 409
    assert send(client, parent_headers, child, snapshot, 'advance', phase='INTRO').status_code == 409
    registered = client.post('/api/auth/register', headers={'X-Soyle-Auth-Mode': 'bearer'}, json={'username': 'cinematic_other', 'email': 'cinematic@example.test', 'password': 'OtherParent123!', 'full_name': 'Другой родитель'})
    headers = {'Authorization': f"Bearer {registered.json()['access_token']}"}
    assert client.get(f'/api/cinematic-storybooks/{child}/toy', headers=headers).status_code == 403
    assert send(client, headers, child, snapshot, 'advance').status_code == 403
    restarted = step(client, parent_headers, child, snapshot, 'restart')
    assert restarted['state']['phase'] == 'INTRO'
    assert send(client, parent_headers, child, first, 'advance', event_id=event_id).json() == restarted

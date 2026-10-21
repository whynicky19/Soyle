import uuid
from app.database import connect
from app.interactive_storybook import STORY, initial_state, transition


def test_six_pages_have_real_games_and_neutral_retry():
    state = transition(initial_state(), 'explore_ball', 'neutral-retry')
    assert not state['ready'] and state['feedback']
    for action in ['find_teddy', 'continue', 'choose_teddy', 'choose_train', 'continue', 'request_point', 'continue', 'receive_teddy', 'continue', 'pick_train', 'place_train', 'continue', 'continue']:
        state = transition(state, action, str(uuid.uuid4()))
    assert state['completed'] and state['request'] == 'request_point' and state['scene_index'] == 5
    assert 'score' not in state
    assert len({scene['image'] for scene in STORY['scenes']}) == 6


def test_order_refusal_break_and_assistance():
    state = initial_state()
    for action in ['continue', 'place_train']:
        try: transition(state, action, str(uuid.uuid4()))
        except ValueError: pass
        else: raise AssertionError('Invalid action accepted')
    state = transition(state, 'refuse', str(uuid.uuid4()))
    assert state['paused'] and state['refusal_count'] == 1 and not state['ready']
    state = transition(state, 'resume', str(uuid.uuid4()))
    state = transition(state, 'break', str(uuid.uuid4()))
    assert state['break_count'] == 1
    state = transition(state, 'resume', str(uuid.uuid4()))
    state = transition(state, 'assist', str(uuid.uuid4()))
    assert state['ready'] and state['assisted_scenes'] == ['find']
    state = transition(state, 'continue', str(uuid.uuid4()))
    assert state['scene_index'] == 1 and not state['ready']


def test_progress_versions_conflicts_delayed_retries_and_family_isolation(client, parent_headers):
    child = client.get('/api/children', headers=parent_headers).json()[0]['id']
    url = f'/api/interactive-storybooks/{child}/toy'
    response = client.get(url, headers=parent_headers)
    assert response.status_code == 200 and response.headers['cache-control'] == 'private, no-store'
    first = response.json()
    def send(snapshot, action, **changes):
        payload = {'version': 3, 'expected_revision': snapshot['revision'], 'scene_id': STORY['scenes'][snapshot['state']['scene_index']]['id'], 'event_id': str(uuid.uuid4()), 'action': action, **changes}
        return client.post(url+'/events', headers=parent_headers, json=payload), payload
    response, payload = send(first, 'find_teddy')
    assert response.status_code == 200
    continued, _ = send(response.json(), 'continue')
    assert continued.status_code == 200
    assert client.post(url+'/events', headers=parent_headers, json=payload).json() == continued.json()
    assert send(first, 'find_teddy')[0].status_code == 409
    assert send(continued.json(), 'choose_train', version=2)[0].status_code == 409
    assert send(continued.json(), 'choose_train', scene_id='find')[0].status_code == 409
    assert client.get(url, headers=parent_headers).json() == continued.json()
    assert client.get(f'/api/cinematic-storybooks/{child}/toy', headers=parent_headers).json()['definition']['version'] == 2
    registered = client.post('/api/auth/register', headers={'X-Soyle-Auth-Mode':'bearer'}, json={'username':'bookother','email':'bookother@example.test','password':'OtherParent123!','full_name':'Другой родитель'})
    other = {'Authorization':f"Bearer {registered.json()['access_token']}"}
    assert client.get(url, headers=other).status_code == 403
    with connect() as db:
        assert db.execute('SELECT count(*) count FROM child_story_progress WHERE child_id=?',(child,)).fetchone()['count'] == 0

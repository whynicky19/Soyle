from uuid import uuid4
import pytest
from app.interactive_storybook import STORY
from app.picnic_content import PICNIC

@pytest.mark.parametrize('definition', [STORY, PICNIC], ids=['toy', 'picnic'])
def test_published_books_finish_and_resume_without_changing_parent_preview_or_game_scores(client, parent_headers, student_headers, definition):
    child = client.get('/api/children', headers=student_headers).json()[0]['id']
    base = f'/api/interactive-storybooks/{child}/{definition["key"]}'
    catalogue = client.get(f'/api/stories/{child}', headers=student_headers).json()
    assert {item['key'] for item in catalogue} == {'toy', 'picnic', 'living-toy', 'misha-help'}
    assert next(item for item in catalogue if item['key'] == definition['key'])['scene_count'] == len(definition['scenes'])
    preview = client.get(base, headers=parent_headers).json()
    dashboard = client.get(f'/api/dashboard/{child}', headers=student_headers).json()
    snapshot = client.get(base, headers=student_headers).json()
    assert not snapshot['preview'] and snapshot['definition']['status'] == 'PUBLISHED'
    def send(action):
        nonlocal snapshot
        payload = {'version':definition['version'], 'expected_revision':snapshot['revision'], 'scene_id':definition['scenes'][snapshot['state']['scene_index']]['id'], 'event_id':str(uuid4()), 'action':action}
        result = client.post(base+'/events', headers=student_headers, json=payload)
        assert result.status_code == 200, result.text
        snapshot = result.json()
        assert client.post(base+'/events', headers=student_headers, json=payload).json() == snapshot
    send('restart')
    for scene in definition['scenes']:
        if definition['key'] == 'toy':
            actions = {'find':['find_teddy'], 'match':['choose_teddy','choose_train'], 'request':['request_help'], 'help':['receive_teddy'], 'play':['pick_train','place_train']}.get(scene['id'], [])
        elif scene['kind'] == 'instruction': actions = scene['sequence_steps']
        elif scene['kind'] == 'choice': actions = [scene['options'][0]['key']]
        else: actions = []
        for action in actions: send(action)
        send('continue')
    assert snapshot['state']['completed']
    assert client.get(base, headers=student_headers).json() == snapshot
    assert client.get(base, headers=parent_headers).json() == preview
    finished = next(item for item in client.get(f'/api/stories/{child}', headers=student_headers).json() if item['key'] == definition['key'])
    assert finished['completed_at'] and finished['scene_index'] == finished['scene_count']
    after = client.get(f'/api/dashboard/{child}', headers=student_headers).json()
    assert (after['stars'],after['total_sessions']) == (dashboard['stars'],dashboard['total_sessions'])
    send('restart')
    assert snapshot['state']['scene_index'] == 0 and not snapshot['state']['completed']

@pytest.mark.parametrize('route,key,version,actions', [
    ('storybooks','living-toy',1,['choose_train','continue','find_teddy','continue','request_help','continue','take_teddy','give_misha','continue','play_roll','settle','continue','continue']),
    ('cinematic-storybooks','misha-help',2,['advance']*3+['request_point']+['advance']*5),
])
def test_live_story_catalogue_versions_save_independently(client,parent_headers,student_headers,route,key,version,actions):
    child=client.get('/api/children',headers=student_headers).json()[0]['id']
    base=f'/api/{route}/{child}/toy'
    snapshot=client.get(base,headers=student_headers).json()
    assert snapshot['definition']['status']=='PUBLISHED' and not snapshot['preview']
    assert snapshot['definition']['version']==version
    preview=client.get(base,headers=parent_headers).json()
    sibling={path:client.get(f'/api/{path}/{child}/toy',headers=student_headers).json() for path in ['storybooks','cinematic-storybooks','interactive-storybooks'] if path!=route}
    before=client.get(f'/api/dashboard/{child}',headers=student_headers).json()
    for action in ['restart',*actions]:
        position={'phase':snapshot['state']['phase']} if version==2 else {'scene_id':snapshot['definition']['scenes'][snapshot['state']['scene_index']]['id']}
        payload={'version':version,'expected_revision':snapshot['revision'],'event_id':str(uuid4()),'action':action,**position}
        response=client.post(base+'/events',headers=student_headers,json=payload)
        assert response.status_code==200,response.text
        snapshot=response.json()
        assert client.post(base+'/events',headers=student_headers,json=payload).json()==snapshot
    assert snapshot['state']['completed']
    assert client.get(base,headers=student_headers).json()==snapshot
    assert client.get(base,headers=parent_headers).json()==preview
    assert all(client.get(f'/api/{path}/{child}/toy',headers=student_headers).json()==data for path,data in sibling.items())
    item=next(book for book in client.get(f'/api/stories/{child}',headers=student_headers).json() if book['key']==key)
    assert item['completed_at'] and item['scene_index']==item['scene_count'] and item['progress_percent']==100
    after=client.get(f'/api/dashboard/{child}',headers=student_headers).json()
    assert (after['stars'],after['total_sessions'])==(before['stars'],before['total_sessions'])

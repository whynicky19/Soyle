import copy
import json
from pathlib import Path
import pytest
from conftest import login
from app.aac_localization import library,seed
from app.aac_grammar import compose_aac_phrase
from app.database import connect,now_iso
from app.security import hash_password
from app.azure_tts import catalogue,speech_ssml


def test_seeded_library_is_complete_pending_and_non_destructive(client,admin_headers,parent_headers,student_headers):
    assert len(library())==70
    with connect() as db:
        before=[dict(row) for row in db.execute("SELECT * FROM aac_cards ORDER BY id").fetchall()]
        count=db.execute('SELECT count(*) n FROM aac_card_translations').fetchone()['n']
        assert count==70
        assert db.execute("SELECT count(*) n FROM aac_card_translations WHERE status='approved'").fetchone()['n']==0
        seed(db)
        assert db.execute('SELECT count(*) n FROM aac_card_translations').fetchone()['n']==count
        assert before==[dict(row) for row in db.execute("SELECT * FROM aac_cards ORDER BY id").fetchall()]
    child=client.get('/api/children',headers=parent_headers).json()[0]['id']
    ru=client.get(f'/api/aac/cards/{child}',headers=parent_headers).json()
    kk={**parent_headers,'Accept-Language':'kk-KZ'}
    preview=client.get(f'/api/aac/cards/{child}?preview=true',headers=kk).json()
    assert {row['id'] for row in preview if row.get('translation_preview')}=={row['id'] for row in ru if row['child_id'] is None}
    assert all(row['language']=='kk' for row in preview)
    assert client.get(f'/api/aac/cards/{child}?preview=true',headers={**student_headers,'Accept-Language':'kk-KZ'}).status_code==403
    assert not any(row.get('translation_preview') for row in client.get(f'/api/aac/cards/{child}',headers=kk).json())
    for card in library():
        assert ('kk',card['speech']) in catalogue()
        assert 'ru-RU' not in speech_ssml(card['speech'],'kk','slow')


def test_library_review_revisions_and_history_language(client,admin_headers,parent_headers):
    with connect() as db:
        person=db.execute("INSERT INTO users(username,email,password_hash,full_name,role,created_at) VALUES(?,?,?,?,?,?) RETURNING id",('aac-reviewer','aac-reviewer@local',hash_password('Reviewer123!'),'AAC test reviewer','specialist',now_iso())).fetchone()
    specialist=login(client,'aac-reviewer','Reviewer123!')
    row=client.get('/api/admin/aac-translations',headers=admin_headers).json()[0]
    url=f"/api/admin/aac-translations/{row['source_card_id']}"
    data=client.get(url,headers=admin_headers).json()
    review={'revision':data['revision'],'comment':'Synthetic automated test review; not a real clinical approval'}
    assert client.post(url+'/approve',headers=admin_headers,json=review).status_code==403
    approved=client.post(url+'/approve',headers=specialist,json=review)
    assert approved.status_code==200,approved.text
    child=client.get('/api/children',headers=parent_headers).json()[0]['id']
    kk={**parent_headers,'Accept-Language':'kk-KZ'}
    board=client.get(f'/api/aac/cards/{child}',headers=kk).json()
    assert any(card['id']==row['source_card_id'] for card in board)
    saved=client.post('/api/aac/history',headers=kk,json={'child_id':child,'card_ids':[row['source_card_id']],'mode':'free'})
    assert saved.status_code==201,saved.text
    assert saved.json()['language']=='kk'
    assert any(item['id']==saved.json()['id'] for item in client.get(f'/api/aac/history/{child}',headers=kk).json())
    assert not any(item['id']==saved.json()['id'] for item in client.get(f'/api/aac/history/{child}',headers=parent_headers).json())
    data=approved.json()
    update={'revision':data['revision'],'payload':data['payload'],'status':'needs_review'}
    assert client.put(url,headers=admin_headers,json=update).status_code==200
    assert client.put(url,headers=admin_headers,json=update).status_code==409
    assert client.get(url,headers=admin_headers).json()['reviewed_by'] is None
    assert not any(card['id']==row['source_card_id'] for card in client.get(f'/api/aac/cards/{child}',headers=kk).json())


def test_preview_does_not_save_child_history(client,parent_headers):
    child=client.get('/api/children',headers=parent_headers).json()[0]['id']
    kk={**parent_headers,'Accept-Language':'kk-KZ'}
    card=next(card for card in client.get(f'/api/aac/cards/{child}?preview=true',headers=kk).json() if card.get('concept_key')=='want')
    response=client.post('/api/aac/history',headers=kk,json={'child_id':child,'card_ids':[card['id']],'mode':'free'})
    assert response.status_code==422


@pytest.mark.parametrize('keys,expected',[
    (['want','water'],'Маған су керек.'),(['me','apple','want'],'Маған алма керек.'),
    (['me','see','mother'],'Мен анамды көріп тұрмын.'),(['me','love','ball'],'Мен допты жақсы көремін.'),
    (['want','draw'],'Сурет салғым келеді.'),
])
def test_kazakh_composition_is_not_russian_word_order(keys,expected):
    cards=[{'language':'kk','concept_key':key,'speech':key,'grammatical_role':'object'} for key in keys]
    result=compose_aac_phrase(cards,'kk')
    assert result['valid'] and result['phrase']==expected
    assert ('kk',expected) in catalogue()


def test_frontend_backend_rules_are_identical():
    root=Path(__file__).resolve().parents[2]
    assert json.loads((root/'backend/app/locales/kk-KZ-aac-rules.json').read_text())==json.loads((root/'frontend/locales/kk-KZ-aac-rules.json').read_text())

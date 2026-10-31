import copy
import pytest
from fastapi import HTTPException
from app.interactive_storybook import STORY, initial_state, transition
from app.story_localization import localize_toy_snapshot, toy_adaptation
from app.localization import LOCALE
from app.azure_tts import catalogue, speech_ssml


def test_kazakh_story_is_complete_preview_with_original_ids_and_no_russian_audio():
    source = copy.deepcopy(STORY)
    state = transition(initial_state(),'hint','test-localization')
    token = LOCALE.set('kk-KZ')
    try:
        result = localize_toy_snapshot({'definition':STORY,'state':state,'preview':True})
        assert result['definition']['title']=='Сүйікті ойыншық'
        assert result['definition']['language']=='kk'
        assert result['definition']['status']=='DRAFT'
        assert result['definition']['review_status']=='needs_review'
        assert result['definition']['approval']=={}
        assert result['definition']['audio']['clips']=={}
        assert result['state']['feedback']!=state['feedback']
        for original, translated in zip(STORY['scenes'],result['definition']['scenes']):
            assert original['id']==translated['id']
            assert original['hotspots']==translated['hotspots']
            assert [x['key'] for x in original['options']]==[x['key'] for x in translated['options']]
            assert translated['narration'] != original['narration']
            assert ('kk',translated['narration']) in catalogue()
            ssml=speech_ssml(translated['narration'],'kk','slow')
            assert 'kk-KZ-AigulNeural' in ssml and 'ru-RU' not in ssml
        with pytest.raises(HTTPException) as error:
            localize_toy_snapshot({'definition':STORY,'state':initial_state(),'preview':False})
        assert error.value.status_code==403
    finally: LOCALE.reset(token)
    assert STORY==source


def test_parent_can_preview_translation_but_child_cannot_use_unreviewed_story(client,parent_headers,student_headers):
    child=client.get('/api/children',headers=parent_headers).json()[0]
    response=client.get(f"/api/interactive-storybooks/{child['id']}/toy",headers={**parent_headers,'Accept-Language':'kk-KZ'})
    assert response.status_code==200,response.text
    assert response.json()['definition']['review_status']=='needs_review'
    student=client.get('/api/auth/me',headers=student_headers).json()
    response=client.get(f"/api/interactive-storybooks/{student['child_id']}/toy",headers={**student_headers,'Accept-Language':'kk-KZ'})
    assert response.status_code==403


def test_picnic_translates_all_branches_without_changing_choices_or_publication():
    from app.picnic_content import PICNIC
    from app.story_localization import localize_story_snapshot
    source = copy.deepcopy(PICNIC)
    token = LOCALE.set('kk-KZ')
    try:
        result=localize_story_snapshot({'definition':PICNIC,'state':initial_state(),'preview':True})
        book=result['definition']
        assert book['title']=='Қонжыққа арналған пикник'
        assert book['status']=='DRAFT' and book['review_status']=='needs_review'
        assert book['approval']=={} and book['audio']['clips']=={}
        assert len(book['scenes'])==12
        for original, translated in zip(PICNIC['scenes'],book['scenes']):
            assert original['id']==translated['id']
            assert original.get('sequence_steps')==translated.get('sequence_steps')
            assert [x['key'] for x in original['options']]==[x['key'] for x in translated['options']]
            assert ('kk',translated['narration']) in catalogue()
            for narration in translated.get('image_by_choice',{}).get('narrations',{}).values():
                assert ('kk',narration) in catalogue()
        for toy in ('Доп','Кітап'):
            for fruit in ('Алма','Банан'):
                assert ('kk',f'Пикник аяқталды. Демалуға болады. Сен таңдадың: {toy}, {fruit}.') in catalogue()
        with pytest.raises(HTTPException):
            localize_story_snapshot({'definition':PICNIC,'state':initial_state(),'preview':False})
    finally: LOCALE.reset(token)
    assert PICNIC==source


@pytest.mark.parametrize('kind',['living','cinematic'])
def test_other_story_adaptations_keep_publication_pending_and_keys_unchanged(kind):
    from app.storybook_content import FAVORITE_TOY
    from app.cinematic_storybook import DEFINITION,initial_state as cinematic_state
    from app.storybook_engine import initial_state as living_state
    from app.story_localization import localize_story_snapshot
    source=FAVORITE_TOY if kind=='living' else DEFINITION
    state=living_state() if kind=='living' else cinematic_state()
    original=copy.deepcopy(source)
    token=LOCALE.set('kk-KZ')
    try:
        result=localize_story_snapshot({'definition':source,'state':state,'preview':True})
        assert result['definition']['language']=='kk'
        assert result['definition']['status']=='DRAFT'
        assert result['definition']['approval']=={}
        if kind=='living':
            for before,after in zip(source['scenes'],result['definition']['scenes']):
                assert before['id']==after['id']
                assert [x['key'] for x in before['actions']]==[x['key'] for x in after['actions']]
                assert ('kk',after['narration']) in catalogue()
        else:
            text=result['definition']['narration_translations']['Миша хочет поиграть с мишкой.']
            assert ('kk',text) in catalogue()
        assert source==original
    finally: LOCALE.reset(token)


def test_story_catalogue_has_no_cross_language_fallback_or_unreviewed_child_material(client,parent_headers,student_headers):
    child=client.get('/api/children',headers=parent_headers).json()[0]
    rows=client.get(f"/api/stories/{child['id']}",headers={**parent_headers,'Accept-Language':'kk-KZ'})
    assert rows.status_code==200,rows.text
    assert rows.json()
    assert all(row['language']=='kk' and row['translation_status']=='needs_review' and row['preview'] for row in rows.json())
    student=client.get('/api/auth/me',headers=student_headers).json()
    assert client.get(f"/api/stories/{student['child_id']}",headers={**student_headers,'Accept-Language':'kk-KZ'}).json()==[]

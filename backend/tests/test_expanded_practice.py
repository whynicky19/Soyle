from copy import deepcopy
from pathlib import Path
import hashlib
import json
import sqlite3

import pytest
from app import database, exercise_engine
from app.database import connect
from app.expanded_content import BANKS, REVISION, instruction_scenarios, build_expanded_payload
from app.migrations import _migration_29_expanded_practice
from app.practice_content import WORDS, ACTIONS, GIVE, PUT
from app.schemas import ExerciseDraftCreate
from app.tts_library import bundled_tts_path

PUBLIC = Path(__file__).resolve().parents[2] / 'frontend' / 'public'


def test_twelve_concepts_per_theme_and_seventy_two_new_real_assets():
    assert len(BANKS) == 7
    for bank in BANKS.values():
        assert len(bank) == 12
        assert len({item['key'] for item in bank}) == 12
        assert len({item['media_ref'] for item in bank}) == 12
        for item in bank:
            assert (PUBLIC / item['media_ref'].lstrip('/')).is_file()
            assert bundled_tts_path(item['speech']).is_file()
    generated = list((PUBLIC / 'learning-expanded').rglob('*.webp'))
    assert len(generated) == 72
    assert len({hashlib.sha256(path.read_bytes()).hexdigest() for path in generated}) == 72


def test_instructions_use_eight_objects_and_forty_distinct_balanced_situations():
    for kind, count, targets in [('give', 16, {'bear', 'adult'}), ('put', 24, {'box', 'basket', 'table'})]:
        scenarios = instruction_scenarios(kind)
        assert len(scenarios) == count
        assert len({item['key'] for item in scenarios}) == count
        assert len({item['success']['object_key'] for item in scenarios}) == 8
        assert {item['success']['target_key'] for item in scenarios} == targets
        assert len({item['result']['media_ref'] for item in scenarios}) == count
        for item in scenarios:
            correct = item['success']
            assert {obj['key'] for obj in item['objects']} >= {correct['object_key'], correct['target_key']}
            assert (PUBLIC / item['result']['media_ref'].lstrip('/')).is_file()
            assert bundled_tts_path(item['speech']).is_file()
            assert bundled_tts_path(item['result']['speech']).is_file()
            assert item['result']['relation'] == ('give' if kind == 'give' else 'on' if correct['target_key'] == 'table' else 'in')


def test_authoring_preserves_larger_banks_and_lengths():
    for original in (WORDS, ACTIONS, GIVE, PUT):
        before = deepcopy(original)
        expanded = build_expanded_payload({**original, 'language': 'ru'})
        value = ExerciseDraftCreate.model_validate(expanded).model_dump(mode='json')
        assert exercise_engine.validate_version(value) == []
        assert value['content']['default_rounds'] == 12
        assert value['content']['bank_key']
        assert len(value['content']['stimuli'] or value['content']['scenarios']) >= 12
        assert original == before


def test_current_versions_are_not_duplicated_and_expansion_is_repeatable(client, monkeypatch, tmp_path):
    if database.DATABASE_URL:
        pytest.skip('Disposable SQLite migration fixture')
    copied = tmp_path / 'expanded-copy.db'
    with sqlite3.connect(database.DB_PATH) as source, sqlite3.connect(copied) as destination:
        source.backup(destination)
    monkeypatch.setattr(database, 'DB_PATH', copied)
    with connect() as db:
        before = [dict(row) for row in db.execute('SELECT * FROM exercise_versions ORDER BY id').fetchall()]
        _migration_29_expanded_practice(db)
        assert before == [dict(row) for row in db.execute('SELECT * FROM exercise_versions ORDER BY id').fetchall()]
        current = [row for row in before if json.loads(row['content_json']).get('revision') == REVISION]
        assert len(current) == len({row['exercise_id'] for row in current})
        for row in current:
            assert row['publication_status'] in {'draft', 'published'}
        assert any(row['publication_status'] == 'archived' and len(json.loads(row['content_json']).get('stimuli', [])) == 8 for row in before)

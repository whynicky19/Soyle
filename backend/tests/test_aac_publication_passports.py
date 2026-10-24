from app.database import connect
from app.migrations import _migration_31_aac_publication_passports
from app.exercise_engine import preview_version
from test_varied_mechanics import isolated_database


def test_aac_passports_are_valid_pending_and_idempotent(client, isolated_database):
    with connect() as db:
        rows = db.execute("SELECT v.id FROM exercise_versions v JOIN exercises e ON e.id=v.exercise_id WHERE v.mechanic='guided_aac' AND v.publication_status='draft' AND e.is_active=1 AND NOT EXISTS (SELECT 1 FROM exercise_versions newer WHERE newer.exercise_id=v.exercise_id AND newer.version>v.version)").fetchall()
        assert len(rows) == 10
        for row in rows:
            preview = preview_version(db, row['id'])
            assert preview['valid'], preview['errors']
            card = preview['version']['method_card']
            assert preview['version']['admin_review_status'] == 'pending'
            assert card['methodology_review_status'] == 'pending'
            assert 'без балла' in ' '.join(card['result_registration'])
            assert not any('Уровень 1' in text for text in card['difficulty_levels'])
        count = db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n']
        _migration_31_aac_publication_passports(db)
        assert db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n'] == count


def test_existing_invalid_aac_stays_unpublished_without_blocking_migration(client, isolated_database):
    import json
    with connect() as db:
        row = db.execute("SELECT v.* FROM exercise_versions v JOIN exercises e ON e.id=v.exercise_id WHERE e.target='request' AND v.publication_status='draft' ORDER BY v.version DESC LIMIT 1").fetchone()
        content = json.loads(row['content_json'])
        content['completion'].pop('accepted_labels', None)
        db.execute("UPDATE exercise_versions SET content_json=?,method_card_json='{}' WHERE id=?", (json.dumps(content),row['id']))
        _migration_31_aac_publication_passports(db)
        latest = db.execute('SELECT id FROM exercise_versions WHERE exercise_id=? ORDER BY version DESC LIMIT 1',(row['exercise_id'],)).fetchone()['id']
        preview = preview_version(db, latest)
        assert not preview['valid']
        assert preview['version']['publication_status'] == 'draft'
        assert preview['version']['technical_status'] == 'pending'
        assert all(not error.startswith('Методическая карточка:') for error in preview['errors'])
        count = db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n']
        _migration_31_aac_publication_passports(db)
        assert db.execute('SELECT COUNT(*) n FROM exercise_versions').fetchone()['n'] == count

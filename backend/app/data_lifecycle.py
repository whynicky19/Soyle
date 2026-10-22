"""Explicit deletion of data that has no foreign-key cascade."""
import json


def delete_child_records(db, child_id: int) -> None:
    student_ids = [row['id'] for row in db.execute('SELECT id FROM student_accounts WHERE child_id=?', (child_id,)).fetchall()]
    goals = {str(row['id']) for row in db.execute('SELECT id FROM parent_practice_goals WHERE child_id=?', (child_id,)).fetchall()}
    old_goals = {str(row['id']) for row in db.execute('SELECT id FROM child_goals WHERE child_id=?', (child_id,)).fetchall()}
    for student_id in student_ids:
        db.execute('DELETE FROM user_settings WHERE user_key=?', (f'student:{student_id}',))
        db.execute('DELETE FROM auth_sessions WHERE subject=?', (f'student:{student_id}',))
        db.execute("DELETE FROM usage_events WHERE actor_type='student' AND user_id=?", (student_id,))
        db.execute('DELETE FROM audit_events WHERE actor_key=?', (f'student:{student_id}',))
    db.execute('DELETE FROM usage_events WHERE child_id=?', (child_id,))
    for row in db.execute('SELECT id,object_type,object_id,metadata FROM audit_events').fetchall():
        try:
            metadata = json.loads(row['metadata'])
        except (ValueError, TypeError):
            metadata = {}
        related = (row['object_type'] == 'child' and row['object_id'] == str(child_id)) or (isinstance(metadata, dict) and metadata.get('child_id') == child_id)
        related |= row['object_type'] == 'practice_goal' and row['object_id'] in goals
        related |= row['object_type'] == 'child_goal' and row['object_id'] in old_goals
        if related:
            db.execute('DELETE FROM audit_events WHERE id=?', (row['id'],))
    db.execute('DELETE FROM children WHERE id=?', (child_id,))


def delete_parent_records(db, user_id: int) -> None:
    for row in db.execute('SELECT id FROM children WHERE parent_id=?', (user_id,)).fetchall():
        delete_child_records(db, row['id'])
    db.execute('DELETE FROM user_settings WHERE user_key=?', (f'user:{user_id}',))
    db.execute('DELETE FROM auth_sessions WHERE subject=?', (str(user_id),))
    db.execute("DELETE FROM usage_events WHERE actor_type='user' AND user_id=?", (user_id,))
    db.execute('DELETE FROM audit_events WHERE actor_key=?', (f'user:{user_id}',))
    db.execute('DELETE FROM users WHERE id=?', (user_id,))

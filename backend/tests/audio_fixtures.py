"""Synthetic recordings for publication tests; never used by the application."""
import io
import wave
from app import audio_review as review
from app.database import connect

def wav_data(value=1000):
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(24000)
        out.writeframes(value.to_bytes(2, 'little', signed=True) * 4800)
    return stream.getvalue()


def approve_fixture_audio(db, version_id, reviewer_id):
    """Synthetic fixture only: real workflow tests below use HTTP listen + approve."""
    audio = wav_data()
    for item in review.targets(db, version_id):
        for mode in review.MODES:
            row = db.execute('SELECT digest FROM speech_recordings WHERE scope_id=? AND phrase_key=? AND mode=?', (version_id, item['key'], mode)).fetchone()
            digest = review.save_candidate(db, version_id, item['key'], mode, 'manual', audio, 'audio/wav', reviewer_id, row['digest'] if row else None)['digest']
            review.review(db, version_id, item['key'], mode, digest, reviewer_id, 'listened')
            review.review(db, version_id, item['key'], mode, digest, reviewer_id, 'approved')


def approve_fixture_version(version_id, db=None):
    if db is None:
        with connect() as connection:
            return approve_fixture_version(version_id, connection)
    if review.manifest(db, version_id)["ready"]:
        return
    admin = db.execute("SELECT id FROM users WHERE role='admin' AND is_active=1 ORDER BY id LIMIT 1").fetchone()["id"]
    previous = db.execute("SELECT publication_status FROM exercise_versions WHERE id=?", (version_id,)).fetchone()["publication_status"]
    db.execute("UPDATE exercise_versions SET publication_status='draft' WHERE id=?", (version_id,))
    approve_fixture_audio(db, version_id, admin)
    db.execute("UPDATE exercise_versions SET publication_status=? WHERE id=?", (previous, version_id))

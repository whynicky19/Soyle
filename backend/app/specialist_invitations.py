"""Single-use invitations. A claim never grants access without family confirmation."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from .database import connect, now_iso
from .security import require_roles

router = APIRouter()


class InvitationToken(BaseModel):
    token: str = Field(min_length=40, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')


def family(db, child_id, user):
    child = db.execute('SELECT id FROM children WHERE id=? AND parent_id=?', (child_id, user['id'])).fetchone()
    if not child:
        raise HTTPException(403, 'Нет доступа к профилю ребёнка')


def sharing(db, child_id):
    if db.backend == 'sqlite':
        db.execute('BEGIN IMMEDIATE')
    suffix = ' FOR UPDATE' if db.backend == 'postgresql' else ''
    consent = db.execute('SELECT privacy_accepted,specialist_sharing FROM child_consents WHERE child_id=?' + suffix, (child_id,)).fetchone()
    if not consent or not consent['privacy_accepted'] or not consent['specialist_sharing']:
        raise HTTPException(403, 'Сначала включите и сохраните разрешение на доступ специалиста')


def record(db, user, action, child_id, invitation_id):
    # The secret invitation is never included in audit metadata.
    db.execute('INSERT INTO audit_events(actor_key,action,object_type,object_id,metadata,created_at) VALUES(?,?,?,?,?,?)',
               (f"user:{user['id']}", action, 'child', str(child_id), '{"invitation_id":' + str(invitation_id) + '}', now_iso()))


@router.get('/api/children/{child_id}/specialist-invitations')
def list_invitations(child_id: int, user: dict = Depends(require_roles('parent'))):
    with connect() as db:
        family(db, child_id, user)
        rows = db.execute('''SELECT i.id,i.status,i.created_at,i.expires_at,i.claimed_by,
            u.full_name specialist_name,u.username specialist_username FROM specialist_invitations i
            LEFT JOIN users u ON u.id=i.claimed_by WHERE i.child_id=? ORDER BY i.id DESC LIMIT 30''', (child_id,)).fetchall()
        return [{**dict(row), 'status': 'expired' if row['expires_at'] <= now_iso() and row['status'] in {'open', 'pending'} else row['status']} for row in rows]


@router.post('/api/children/{child_id}/specialist-invitations', status_code=201)
def create_invitation(child_id: int, user: dict = Depends(require_roles('parent'))):
    token = secrets.token_urlsafe(32)
    stamp = now_iso()
    expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    with connect() as db:
        family(db, child_id, user)
        sharing(db, child_id)
        db.execute("UPDATE specialist_invitations SET status='cancelled' WHERE child_id=? AND status='open'", (child_id,))
        row = db.execute('''INSERT INTO specialist_invitations(child_id,parent_id,token_hash,status,created_at,expires_at)
            VALUES(?,?,?,'open',?,?) RETURNING id''', (child_id, user['id'], hashlib.sha256(token.encode()).hexdigest(), stamp, expires)).fetchone()
        record(db, user, 'specialist.invite', child_id, row['id'])
    return {'id': row['id'], 'token': token, 'expires_at': expires}


@router.post('/api/specialist-invitations/claim')
def claim_invitation(payload: InvitationToken, user: dict = Depends(require_roles('specialist'))):
    digest = hashlib.sha256(payload.token.encode()).hexdigest()
    with connect() as db:
        changed = db.execute("UPDATE specialist_invitations SET status='pending',claimed_by=? WHERE token_hash=? AND status='open' AND expires_at>? RETURNING id,child_id", (user['id'], digest, now_iso())).fetchone()
        if not changed:
            row = db.execute('SELECT status,claimed_by,expires_at FROM specialist_invitations WHERE token_hash=?', (digest,)).fetchone()
            if row and row['claimed_by'] == user['id'] and row['status'] == 'pending' and row['expires_at'] > now_iso():
                return {'status': 'pending'}
            raise HTTPException(410, 'Приглашение недействительно, уже использовано или срок ссылки истёк. Попросите родителя создать новое.')
        record(db, user, 'specialist.invite.claim', changed['child_id'], changed['id'])
    return {'status': 'pending'}


@router.post('/api/children/{child_id}/specialist-invitations/{invitation_id}/approve')
def approve_invitation(child_id: int, invitation_id: int, user: dict = Depends(require_roles('parent'))):
    with connect() as db:
        family(db, child_id, user)
        sharing(db, child_id)
        row = db.execute("""UPDATE specialist_invitations SET status='approved' WHERE id=? AND child_id=?
            AND parent_id=? AND status='pending' AND expires_at>?
            AND claimed_by IN (SELECT id FROM users WHERE role='specialist' AND is_active=1) RETURNING claimed_by""", (invitation_id, child_id, user['id'], now_iso())).fetchone()
        if not row:
            raise HTTPException(409, 'Запрос больше недоступен. Обновите список приглашений.')
        db.execute('INSERT INTO specialist_children(specialist_id,child_id,assigned_at) VALUES(?,?,?) ON CONFLICT(specialist_id,child_id) DO NOTHING', (row['claimed_by'], child_id, now_iso()))
        record(db, user, 'specialist.invite.approve', child_id, invitation_id)
    return {'status': 'approved'}


@router.delete('/api/children/{child_id}/specialist-invitations/{invitation_id}', status_code=204)
def cancel_invitation(child_id: int, invitation_id: int, user: dict = Depends(require_roles('parent'))):
    with connect() as db:
        family(db, child_id, user)
        db.execute("UPDATE specialist_invitations SET status='cancelled' WHERE id=? AND child_id=? AND status IN ('open','pending')", (invitation_id, child_id))
        record(db, user, 'specialist.invite.cancel', child_id, invitation_id)

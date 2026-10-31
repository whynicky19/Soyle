"""Versioned translations of shared AAC cards; canonical IDs never change."""
import hashlib
import json
from pathlib import Path
from fastapi import HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from .database import now_iso


def library():
    return json.loads((Path(__file__).parent/'locales/kk-KZ-aac-library.json').read_text())['cards']


def fingerprint(card):
    return hashlib.sha256(json.dumps({key:card[key] for key in ('label','speech','category','grammatical_role','image')},sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def seed(db):
    translations={row['source_label']:row for row in library()}
    for source in db.execute("SELECT * FROM aac_cards WHERE child_id IS NULL AND language='ru'").fetchall():
        entry=translations.get(source['label'])
        if not entry: continue
        payload={key:entry[key] for key in ('label','speech','concept_key')}
        db.execute("""INSERT INTO aac_card_translations(source_card_id,locale,revision,source_digest,payload_json,status,updated_at)
            VALUES(?,'kk-KZ',1,?,?,'needs_review',?) ON CONFLICT(source_card_id,locale) DO NOTHING""",
            (source['id'],fingerprint(source),json.dumps(payload,ensure_ascii=False),now_iso()))
        archive(db,source['id'])


def localize_cards(db, cards, language, preview=False):
    result=[]
    for raw in cards:
        card=dict(raw)
        if card['language']==language:
            result.append(card);continue
        if language!='kk' or card.get('child_id') is not None: continue
        row=db.execute("SELECT * FROM aac_card_translations WHERE source_card_id=? AND locale='kk-KZ'",(card['id'],)).fetchone()
        if not row or row['source_digest']!=fingerprint(card):continue
        if not preview and (row['status']!='approved' or not row['reviewed_by']):continue
        card.update(json.loads(row['payload_json']))
        card.update(language='kk',translation_status=row['status'],translation_revision=row['revision'],translation_preview=row['status']!='approved')
        result.append(card)
    return result


def detail(db, card_id):
    source=db.execute("SELECT * FROM aac_cards WHERE id=? AND child_id IS NULL AND language='ru'",(card_id,)).fetchone()
    row=db.execute("SELECT * FROM aac_card_translations WHERE source_card_id=? AND locale='kk-KZ'",(card_id,)).fetchone()
    if not source or not row:raise HTTPException(404,'translation.source_missing')
    return dict(source_card_id=card_id,source=dict(source),revision=row['revision'],status=row['status'],payload=json.loads(row['payload_json']),reviewed_by=row['reviewed_by'],review_comment=row['review_comment'])


class Edit(BaseModel):
    revision:int=Field(ge=1)
    payload:dict
    status:Literal['draft','needs_review']='draft'


class Review(BaseModel):
    revision:int=Field(ge=1)
    comment:str=Field(min_length=10,max_length=2000)


def archive(db, card_id):
    row=db.execute("SELECT * FROM aac_card_translations WHERE source_card_id=? AND locale='kk-KZ'",(card_id,)).fetchone()
    db.execute("""INSERT INTO aac_translation_history(source_card_id,locale,revision,snapshot_json,recorded_at)
        VALUES(?,'kk-KZ',?,?,?) ON CONFLICT(source_card_id,locale,revision) DO NOTHING""",
        (card_id,row['revision'],json.dumps({**dict(row),'source':dict(db.execute('SELECT * FROM aac_cards WHERE id=?',(card_id,)).fetchone())},ensure_ascii=False),now_iso()))


def edit(db, card_id, payload, actor):
    db.execute('UPDATE aac_cards SET is_active=is_active WHERE id=?',(card_id,))
    current=detail(db,card_id)
    if current['revision']!=payload.revision:raise HTTPException(409,'translation.conflict')
    if set(payload.payload)!={'label','speech','concept_key'}:raise HTTPException(422,'translation.shape')
    for key in ('label','speech'):
        if not isinstance(payload.payload[key],str) or not 0<len(payload.payload[key].strip())<=120:raise HTTPException(422,'translation.text')
    if payload.payload['concept_key']!=current['payload']['concept_key']:raise HTTPException(422,'translation.immutable')
    cleaned={**payload.payload,"label":payload.payload["label"].strip(),"speech":payload.payload["speech"].strip()}
    db.execute("""UPDATE aac_card_translations SET payload_json=?,status=?,revision=revision+1,source_digest=?,updated_by=?,updated_at=?,reviewed_by=NULL,reviewed_at=NULL,review_comment=NULL
        WHERE source_card_id=? AND locale='kk-KZ'""",(json.dumps(cleaned,ensure_ascii=False),payload.status,fingerprint(current['source']),actor,now_iso(),card_id))
    archive(db,card_id)
    return detail(db,card_id)


def approve(db,card_id,payload,actor):
    db.execute('UPDATE aac_cards SET is_active=is_active WHERE id=?',(card_id,))
    current=detail(db,card_id)
    if len(payload.comment.strip())<10:raise HTTPException(422,'translation.text')
    row=db.execute("SELECT * FROM aac_card_translations WHERE source_card_id=? AND locale='kk-KZ'",(card_id,)).fetchone()
    if current['revision']!=payload.revision or current['status']!='needs_review' or row['source_digest']!=fingerprint(current['source']):raise HTTPException(409,'translation.conflict')
    db.execute("""UPDATE aac_card_translations SET status='approved',revision=revision+1,reviewed_by=?,reviewed_at=?,review_comment=? WHERE source_card_id=? AND locale='kk-KZ'""",(actor,now_iso(),payload.comment.strip(),card_id))
    archive(db,card_id)
    return detail(db,card_id)


def approved_speech(db,text):
    rows=db.execute("""SELECT c.*,t.source_digest,t.payload_json FROM aac_card_translations t JOIN aac_cards c ON c.id=t.source_card_id
        WHERE c.child_id IS NULL AND c.is_active=1 AND t.locale='kk-KZ' AND t.status='approved' AND t.reviewed_by IS NOT NULL""").fetchall()
    return any(row['source_digest']==fingerprint(row) and json.loads(row['payload_json'])['speech']==text for row in rows)

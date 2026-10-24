"""P1 family observations, review-gated home activities and descriptive totals."""

import json
from typing import Any

from fastapi import HTTPException

from .database import now_iso
from .p1_content import HOME_OBSERVATION_OUTCOMES, OBSERVATION_STATUSES, SKILL_CATEGORIES


def _decode_activity(row: Any, *, include_content: bool) -> dict:
    item = dict(row)
    item.pop("method_card_json", None)
    if include_content:
        for field in ("materials", "adult_instructions", "accepted_responses", "prompts", "stop_conditions"):
            item[field] = json.loads(item.pop(f"{field}_json") or "[]")
    else:
        for field in ("materials_json", "adult_instructions_json", "accepted_responses_json", "prompts_json", "stop_conditions_json", "objective"):
            item.pop(field, None)
    return item


def skill_map(db, child_id: int) -> list[dict]:
    rows = db.execute("SELECT * FROM skill_observations WHERE child_id=?", (child_id,)).fetchall()
    by_category = {row["category"]: dict(row) for row in rows}
    return [
        {
            "category": category,
            "label": label,
            "status": by_category.get(category, {}).get("status", "not_observed"),
            "note": by_category.get(category, {}).get("note", ""),
            "source": by_category.get(category, {}).get("source", "real_life_parent_observation"),
            "observed_at": by_category.get(category, {}).get("observed_at"),
            "updated_at": by_category.get(category, {}).get("updated_at"),
        }
        for category, label in SKILL_CATEGORIES
    ]


def upsert_skill_observation(db, child_id: int, category: str, payload: dict, user_id: int) -> dict:
    allowed = dict(SKILL_CATEGORIES)
    if category not in allowed:
        raise HTTPException(422, "Неизвестная категория наблюдения")
    if payload["status"] not in OBSERVATION_STATUSES:
        raise HTTPException(422, "Неизвестный статус наблюдения")
    stamp = now_iso()
    observed_at = payload.get("observed_at") or stamp
    db.execute(
        """INSERT INTO skill_observations(
               child_id,category,status,note,source,observed_at,created_by,created_at,updated_at)
           VALUES(?,?,?,?,'real_life_parent_observation',?,?,?,?)
           ON CONFLICT(child_id,category) DO UPDATE SET
               status=excluded.status,note=excluded.note,observed_at=excluded.observed_at,updated_at=excluded.updated_at""",
        (child_id, category, payload["status"], payload.get("note", ""), observed_at, user_id, stamp, stamp),
    )
    row = db.execute("SELECT * FROM skill_observations WHERE child_id=? AND category=?", (child_id, category)).fetchone()
    result = dict(row)
    result["label"] = allowed[category]
    return result


def home_library(db, child_id: int) -> dict:
    published = db.execute(
        """SELECT * FROM home_activity_templates
           WHERE review_status='approved' AND publication_status='published' ORDER BY position,id"""
    ).fetchall()
    pending = db.execute(
        """SELECT * FROM home_activity_templates
           WHERE publication_status='draft' ORDER BY position,id"""
    ).fetchall()
    observations = db.execute(
        """SELECT o.*,t.title activity_title FROM home_activity_observations o
           JOIN home_activity_templates t ON t.id=o.activity_id
           WHERE o.child_id=? ORDER BY o.observed_at DESC,o.id DESC LIMIT 40""",
        (child_id,),
    ).fetchall()
    return {
        "activities": [_decode_activity(row, include_content=True) for row in published],
        "pending_review": [_decode_activity(row, include_content=False) for row in pending],
        "observations": [dict(row) for row in observations],
        "notice": "Домашние игры не являются диагностикой. Черновики недоступны до методической проверки.",
    }


def save_home_observation(db, child_id: int, payload: dict, user_id: int, observation_id: int | None = None) -> dict:
    if payload["outcome"] not in HOME_OBSERVATION_OUTCOMES:
        raise HTTPException(422, "Неизвестный результат наблюдения")
    activity = db.execute(
        """SELECT id FROM home_activity_templates
           WHERE id=? AND review_status='approved' AND publication_status='published'""",
        (payload["activity_id"],),
    ).fetchone()
    if not activity:
        raise HTTPException(409, "Игра пока недоступна: требуется методическая проверка")
    stamp = now_iso()
    observed_at = payload.get("observed_at") or stamp
    if observation_id is None:
        cursor = db.execute(
            """INSERT INTO home_activity_observations(
                   child_id,activity_id,outcome,prompt_level,note,source,observed_at,created_by,created_at,updated_at)
               VALUES(?,?,?,?,?,'real_life_parent_observation',?,?,?,?) RETURNING id""",
            (
                child_id, payload["activity_id"], payload["outcome"], payload.get("prompt_level"),
                payload.get("note", ""), observed_at, user_id, stamp, stamp,
            ),
        )
        observation_id = cursor.fetchone()["id"]
    else:
        existing = db.execute(
            "SELECT id FROM home_activity_observations WHERE id=? AND child_id=?",
            (observation_id, child_id),
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Наблюдение не найдено")
        db.execute(
            """UPDATE home_activity_observations SET
                   activity_id=?,outcome=?,prompt_level=?,note=?,observed_at=?,updated_at=?
               WHERE id=? AND child_id=?""",
            (
                payload["activity_id"], payload["outcome"], payload.get("prompt_level"), payload.get("note", ""),
                observed_at, stamp, observation_id, child_id,
            ),
        )
    row = db.execute(
        """SELECT o.*,t.title activity_title FROM home_activity_observations o
           JOIN home_activity_templates t ON t.id=o.activity_id WHERE o.id=?""",
        (observation_id,),
    ).fetchone()
    return dict(row)


def descriptive_results(db, child_id: int) -> dict:
    sessions = [dict(row) for row in db.execute(
        """SELECT attempt_status,gameplay_choices,independent_completions,prompted_completions,
                  prompts_used,attempts_count,correct_answers,support_context
           FROM sessions WHERE child_id=? AND measurement_version>=1
             AND response_owner='child' AND support_context<>'unknown'""",
        (child_id,),
    ).fetchall()]
    real_life_skill = db.execute("SELECT COUNT(*) count FROM skill_observations WHERE child_id=?", (child_id,)).fetchone()["count"]
    real_life_home = db.execute("SELECT COUNT(*) count FROM home_activity_observations WHERE child_id=?", (child_id,)).fetchone()["count"]
    real_life_goals = db.execute("SELECT COUNT(*) count FROM practice_goal_observations WHERE child_id=?", (child_id,)).fetchone()["count"]
    real_life_specialist = db.execute("SELECT COUNT(*) count FROM specialist_observations WHERE child_id=?", (child_id,)).fetchone()["count"]
    return {
        "gameplay_choices": sum(row.get("gameplay_choices") or 0 for row in sessions),
        "gameplay_rounds": sum(row.get("attempts_count") or 0 for row in sessions if row["attempt_status"] == "completed"),
        "correct_gameplay_rounds": sum(row.get("correct_answers") or 0 for row in sessions if row["attempt_status"] == "completed"),
        "independent_completions": sum(row.get("independent_completions") or 0 for row in sessions),
        "prompted_completions": sum(row.get("prompted_completions") or 0 for row in sessions),
        "prompts_used": sum(row.get("prompts_used") or 0 for row in sessions),
        "refusals": sum(1 for row in sessions if row["attempt_status"] == "refused"),
        "breaks": sum(1 for row in sessions if row["attempt_status"] == "break"),
        "technical_errors": sum(1 for row in sessions if row["attempt_status"] == "technical_error"),
        "modelled_responses": sum(1 for row in sessions if row["support_context"] == "caregiver_modelled"),
        "real_life_observations": real_life_skill + real_life_home + real_life_goals + real_life_specialist,
        "disclaimer": "Показатели описывают отдельные игровые попытки и бытовые наблюдения; они не объединяются в оценку развития речи.",
    }

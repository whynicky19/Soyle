"""Parent-owned, non-clinical practice goals for P2.1.

This module intentionally does not reuse the legacy ``child_goals`` table: that
table belongs to the disabled specialist workflow.  A parent can only start
from the prepared catalogue below and can never publish content or make a
clinical prescription through these helpers.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

from .database import now_iso


PRACTICE_GOAL_TEMPLATES = (
    {
        "key": "recognise-five-objects",
        "title": "Узнавать 5 знакомых предметов",
        "skill_category": "object_understanding",
        "observable_behavior": "Выбирает названный знакомый предмет среди изображений.",
        "baseline_prompt": "Отметьте, сколько знакомых предметов ребёнок сейчас выбирает и какая помощь нужна.",
        "target_outcome": "Выбирает 5 знакомых предметов в спокойной игре доступным способом.",
        "accepted_responses": ["нажатие на изображение", "указательный жест", "взгляд с подтверждением взрослого"],
        "default_help_level": "full",
        "matching_targets": ["animals", "food", "toys"],
        "matching_mechanics": ["auditory_choice"],
    },
    {
        "key": "recognise-actions",
        "title": "Выбирать изображения знакомых действий",
        "skill_category": "action_understanding",
        "observable_behavior": "Выбирает сцену с названным действием.",
        "baseline_prompt": "Запишите, какие действия уже узнаются и нужна ли визуальная подсказка.",
        "target_outcome": "Выбирает знакомое действие среди двух или трёх сцен.",
        "accepted_responses": ["нажатие на сцену", "указательный жест", "взгляд с подтверждением взрослого"],
        "default_help_level": "full",
        "matching_targets": ["actions", "p15-actions-core"],
        "matching_mechanics": ["action_choice"],
    },
    {
        "key": "follow-one-step-instruction",
        "title": "Выполнять простую инструкцию с помощью",
        "skill_category": "instruction_understanding",
        "observable_behavior": "Выбирает нужный предмет и цель после одной простой инструкции.",
        "baseline_prompt": "Опишите знакомую инструкцию и текущую помощь: показ, жест или словесное напоминание.",
        "target_outcome": "Выполняет одну знакомую инструкцию с постепенно уменьшаемой помощью.",
        "accepted_responses": ["два последовательных нажатия", "действие с реальным предметом, отмеченное родителем"],
        "default_help_level": "full",
        "matching_targets": ["p1-simple-instructions-demo", "p15-instructions-one-step"],
        "matching_mechanics": ["tap_instruction"],
    },
    {
        "key": "aac-ask-for-help",
        "title": "Просить помощь через AAC",
        "skill_category": "aac_use",
        "observable_behavior": "Использует доступную AAC-карточку или короткое сообщение, чтобы попросить помощь.",
        "baseline_prompt": "Отметьте, замечает ли ребёнок карточку «Помоги» и какая поддержка нужна.",
        "target_outcome": "Использует сообщение о помощи в игре или бытовой ситуации.",
        "accepted_responses": ["AAC-карточка", "жест", "слово или приближённое слово"],
        "default_help_level": "minimal",
        "matching_targets": ["help", "request"],
        "matching_mechanics": ["guided_aac"],
    },
    {
        "key": "express-request",
        "title": "Выражать просьбу доступным способом",
        "skill_category": "request_expression",
        "observable_behavior": "Сообщает о желаемом предмете или действии доступным способом.",
        "baseline_prompt": "Запишите, как ребёнок обычно просит и нужно ли предлагать карточки.",
        "target_outcome": "Самостоятельно выбирает понятное сообщение-просьбу в знакомой ситуации.",
        "accepted_responses": ["AAC-карточка или фраза", "жест", "слово или приближённое слово"],
        "default_help_level": "minimal",
        "matching_targets": ["desire", "request", "need", "choice"],
        "matching_mechanics": ["guided_aac"],
    },
    {
        "key": "use-no-stop",
        "title": "Использовать «нет» или «стоп»",
        "skill_category": "self_advocacy",
        "observable_behavior": "Сообщает об отказе или необходимости остановиться доступным способом.",
        "baseline_prompt": "Отметьте привычный сигнал отказа; его не нужно исправлять или превращать в обязательную речь.",
        "target_outcome": "Использует понятное «нет» или «стоп», которое взрослый принимает сразу.",
        "accepted_responses": ["AAC-карточка", "жест", "слово", "отворачивание или другой устойчивый сигнал"],
        "default_help_level": "independent",
        "matching_targets": ["refusal"],
        "matching_mechanics": ["guided_aac"],
    },
)

GOAL_STATUSES = {"active", "paused", "completed"}
HELP_LEVELS = {"independent", "minimal", "full"}
OBSERVATION_RESULTS = {"not_observed", "independent", "with_help", "refused", "break", "technical_error"}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _loads(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


def decode_template(row: Any) -> dict:
    item = dict(row)
    item["accepted_responses"] = _loads(item.pop("accepted_responses_json"), [])
    item["matching_targets"] = _loads(item.pop("matching_targets_json"), [])
    item["matching_mechanics"] = _loads(item.pop("matching_mechanics_json"), [])
    return item


def decode_goal(row: Any) -> dict:
    item = dict(row)
    item["accepted_responses"] = _loads(item.pop("accepted_responses_json"), [])
    item["matching_targets"] = _loads(item.pop("matching_targets_json"), [])
    item["matching_mechanics"] = _loads(item.pop("matching_mechanics_json"), [])
    return item


def goal_snapshot(goal: dict) -> dict:
    return {
        key: goal[key]
        for key in (
            "id", "child_id", "template_key", "version", "title", "skill_category",
            "observable_behavior", "baseline", "target_outcome", "accepted_responses",
            "help_level", "matching_targets", "matching_mechanics", "status", "source",
        )
    }


def record_goal_history(db, goal: dict, event_type: str, changed_by: int) -> None:
    db.execute(
        """INSERT INTO practice_goal_history(
               goal_id,child_id,goal_version,event_type,snapshot_json,changed_by,source,created_at)
           VALUES(?,?,?,?,?,?,'parent_home_practice',?)""",
        (goal["id"], goal["child_id"], goal["version"], event_type, _json(goal_snapshot(goal)), changed_by, now_iso()),
    )


def list_templates(db) -> list[dict]:
    return [decode_template(row) for row in db.execute(
        "SELECT * FROM practice_goal_templates WHERE status='available' ORDER BY position,id"
    ).fetchall()]


def _related_exercises(db, goal: dict) -> list[dict]:
    # Local import prevents a migration-time import cycle.
    from .exercise_engine import published_exercise_rows

    targets = set(goal["matching_targets"])
    mechanics = set(goal["matching_mechanics"])
    return [
        {
            "id": exercise["id"],
            "title": exercise["title"],
            "target": exercise["target"],
            "mechanic": exercise["engine"]["mechanic"],
            "exercise_version_id": exercise["engine"]["version_id"],
            "exercise_version": exercise["engine"]["version"],
        }
        for exercise in published_exercise_rows(db)
        if exercise["module"] != "motor"
        and exercise["target"] in targets
        and exercise["engine"]["mechanic"] in mechanics
    ]


def list_goals(db, child_id: int) -> list[dict]:
    rows = db.execute(
        """SELECT * FROM parent_practice_goals WHERE child_id=?
           ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,updated_at DESC,id DESC""",
        (child_id,),
    ).fetchall()
    goals = []
    for row in rows:
        item = decode_goal(row)
        item["linked_exercises"] = _related_exercises(db, item)
        item["observations"] = [dict(observation) for observation in db.execute(
            """SELECT * FROM practice_goal_observations WHERE goal_id=? AND child_id=?
               ORDER BY observed_at DESC,id DESC LIMIT 20""",
            (item["id"], child_id),
        ).fetchall()]
        item["history"] = [
            {**dict(history), "snapshot": _loads(history["snapshot_json"], {})}
            for history in db.execute(
                "SELECT * FROM practice_goal_history WHERE goal_id=? ORDER BY id DESC LIMIT 20",
                (item["id"],),
            ).fetchall()
        ]
        for history in item["history"]:
            history.pop("snapshot_json", None)
        goals.append(item)
    return goals


def create_goal(db, child_id: int, template_key: str, baseline: str, help_level: str, user_id: int) -> dict:
    template_row = db.execute(
        "SELECT * FROM practice_goal_templates WHERE template_key=? AND status='available'",
        (template_key,),
    ).fetchone()
    if not template_row:
        raise HTTPException(422, "Цель отсутствует в подготовленном каталоге")
    if help_level not in HELP_LEVELS:
        raise HTTPException(422, "Неизвестный уровень помощи")
    if db.execute(
        "SELECT 1 FROM parent_practice_goals WHERE child_id=? AND template_key=? AND status IN ('active','paused')",
        (child_id, template_key),
    ).fetchone():
        raise HTTPException(409, "Такая домашняя практическая цель уже добавлена")
    template = decode_template(template_row)
    stamp = now_iso()
    cursor = db.execute(
        """INSERT INTO parent_practice_goals(
               child_id,template_id,template_key,version,title,skill_category,observable_behavior,
               baseline,target_outcome,accepted_responses_json,help_level,matching_targets_json,
               matching_mechanics_json,status,source,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active','parent_home_practice',?,?,?) RETURNING id""",
        (
            child_id, template["id"], template["template_key"], 1, template["title"],
            template["skill_category"], template["observable_behavior"], baseline,
            template["target_outcome"], _json(template["accepted_responses"]), help_level,
            _json(template["matching_targets"]), _json(template["matching_mechanics"]),
            user_id, stamp, stamp,
        ),
    )
    goal = decode_goal(db.execute("SELECT * FROM parent_practice_goals WHERE id=?", (cursor.fetchone()["id"],)).fetchone())
    record_goal_history(db, goal, "created", user_id)
    return goal


def update_goal(db, goal_id: int, child_id: int, expected_version: int, changes: dict, user_id: int) -> dict:
    row = db.execute("SELECT * FROM parent_practice_goals WHERE id=? AND child_id=?", (goal_id, child_id)).fetchone()
    if not row:
        raise HTTPException(404, "Домашняя практическая цель не найдена")
    current = decode_goal(row)
    if current["version"] != expected_version:
        raise HTTPException(409, "Цель уже была изменена. Обновите страницу и повторите действие")
    status = changes.get("status", current["status"])
    help_level = changes.get("help_level", current["help_level"])
    if status not in GOAL_STATUSES or help_level not in HELP_LEVELS:
        raise HTTPException(422, "Неизвестный статус или уровень помощи")
    baseline = changes.get("baseline") if changes.get("baseline") is not None else current["baseline"]
    target = changes.get("target_outcome") if changes.get("target_outcome") is not None else current["target_outcome"]
    next_version = current["version"] + 1
    updated = db.execute(
        """UPDATE parent_practice_goals SET version=?,baseline=?,target_outcome=?,help_level=?,status=?,updated_at=?
           WHERE id=? AND child_id=? AND version=?""",
        (next_version, baseline, target, help_level, status, now_iso(), goal_id, child_id, expected_version),
    )
    if updated.rowcount != 1:
        raise HTTPException(409, "Цель уже была изменена. Обновите страницу и повторите действие")
    goal = decode_goal(db.execute("SELECT * FROM parent_practice_goals WHERE id=?", (goal_id,)).fetchone())
    record_goal_history(db, goal, "updated", user_id)
    return goal


def save_observation(db, goal_id: int, child_id: int, payload: dict, user_id: int, observation_id: int | None = None) -> dict:
    goal = db.execute("SELECT id,version FROM parent_practice_goals WHERE id=? AND child_id=?", (goal_id, child_id)).fetchone()
    if not goal:
        raise HTTPException(404, "Домашняя практическая цель не найдена")
    if payload["result_type"] not in OBSERVATION_RESULTS:
        raise HTTPException(422, "Неизвестный результат наблюдения")
    stamp = now_iso()
    observed_at = payload.get("observed_at") or stamp
    if observation_id is None:
        cursor = db.execute(
            """INSERT INTO practice_goal_observations(
                   goal_id,child_id,goal_version,result_type,prompt_level,note,source,observed_at,created_by,created_at,updated_at)
               VALUES(?,?,?,?,?,?,'parent_real_life_observation',?,?,?,?) RETURNING id""",
            (goal_id, child_id, goal["version"], payload["result_type"], payload.get("prompt_level"),
             payload.get("note", ""), observed_at, user_id, stamp, stamp),
        )
        observation_id = cursor.fetchone()["id"]
    else:
        existing = db.execute(
            "SELECT id FROM practice_goal_observations WHERE id=? AND goal_id=? AND child_id=?",
            (observation_id, goal_id, child_id),
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Наблюдение не найдено")
        db.execute(
            """UPDATE practice_goal_observations SET result_type=?,prompt_level=?,note=?,observed_at=?,updated_at=?
               WHERE id=? AND goal_id=? AND child_id=?""",
            (payload["result_type"], payload.get("prompt_level"), payload.get("note", ""), observed_at,
             stamp, observation_id, goal_id, child_id),
        )
    return dict(db.execute("SELECT * FROM practice_goal_observations WHERE id=?", (observation_id,)).fetchone())


def get_preferences(db, child_id: int) -> dict:
    row = db.execute("SELECT * FROM child_practice_preferences WHERE child_id=?", (child_id,)).fetchone()
    if not row:
        return {"child_id": child_id, "preferred_exercise_ids": [], "avoided_exercise_ids": [], "note": "", "updated_at": None}
    item = dict(row)
    item["preferred_exercise_ids"] = _loads(item.pop("preferred_exercise_ids_json"), [])
    item["avoided_exercise_ids"] = _loads(item.pop("avoided_exercise_ids_json"), [])
    return item


def save_preferences(db, child_id: int, payload: dict, user_id: int) -> dict:
    preferred = list(dict.fromkeys(payload.get("preferred_exercise_ids", [])))
    avoided = list(dict.fromkeys(payload.get("avoided_exercise_ids", [])))
    if set(preferred) & set(avoided):
        raise HTTPException(422, "Одно задание нельзя одновременно предпочитать и избегать")
    published_ids = {item["id"] for item in _published_non_motor(db)}
    if any(item not in published_ids for item in preferred + avoided):
        raise HTTPException(422, "Предпочтения можно сохранять только для опубликованных немоторных заданий")
    stamp = now_iso()
    db.execute(
        """INSERT INTO child_practice_preferences(
               child_id,preferred_exercise_ids_json,avoided_exercise_ids_json,note,created_by,updated_at)
           VALUES(?,?,?,?,?,?) ON CONFLICT(child_id) DO UPDATE SET
               preferred_exercise_ids_json=excluded.preferred_exercise_ids_json,
               avoided_exercise_ids_json=excluded.avoided_exercise_ids_json,
               note=excluded.note,created_by=excluded.created_by,updated_at=excluded.updated_at""",
        (child_id, _json(preferred), _json(avoided), payload.get("note", ""), user_id, stamp),
    )
    return get_preferences(db, child_id)


def _published_non_motor(db) -> list[dict]:
    from .exercise_engine import published_exercise_rows
    return [item for item in published_exercise_rows(db) if item["module"] != "motor"]

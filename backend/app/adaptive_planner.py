"""Deterministic and explainable P2.1 practice planning.

No model or free-form AI output participates in selection.  Every item keeps
the exact goal/exercise versions, parameters and reason used at planning time.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .database import now_iso
from .exercise_engine import published_exercise_rows
from .practice_goals import decode_goal, get_preferences


RULES_VERSION = "p2.1-rules-1"


@dataclass(frozen=True)
class PlannerThresholds:
    recent_window: int = 8
    level_two_sessions: int = 3
    level_three_sessions: int = 6
    minimum_accuracy: float = 0.8
    minimum_independent_completions: int = 3
    recent_repeat_window: int = 3


DEFAULT_THRESHOLDS = PlannerThresholds()


def _loads(value: str | None, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


def _evidence(db, child_id: int, exercise_id: int, thresholds: PlannerThresholds) -> dict:
    rows = [dict(row) for row in db.execute(
        """SELECT id,attempt_status,attempts_count,correct_answers,prompts_used,
                  independent_completions,prompted_completions,prompt_level,created_at
           FROM sessions WHERE child_id=? AND exercise_id=? AND measurement_version>=1
           ORDER BY id DESC LIMIT ?""",
        (child_id, exercise_id, thresholds.recent_window),
    ).fetchall()]
    completed = [row for row in rows if row["attempt_status"] == "completed" and (row.get("attempts_count") or 0) > 0]
    attempts = sum(row.get("attempts_count") or 0 for row in completed)
    correct = sum(row.get("correct_answers") or 0 for row in completed)
    independent = sum(row.get("independent_completions") or 0 for row in completed)
    prompts = sum(row.get("prompts_used") or 0 for row in completed)
    return {
        "recorded_sessions": len(completed),
        "attempts": attempts,
        "accuracy": round(correct / attempts, 3) if attempts else None,
        "independent_completions": independent,
        "prompts_used": prompts,
        "refusals": sum(row["attempt_status"] == "refused" for row in rows),
        "breaks": sum(row["attempt_status"] == "break" for row in rows),
        "technical_errors": sum(row["attempt_status"] == "technical_error" for row in rows),
    }


def _parent_observation_evidence(db, goal_id: int) -> dict:
    rows = [dict(row) for row in db.execute(
        """SELECT result_type,prompt_level,observed_at
           FROM practice_goal_observations
           WHERE goal_id=? AND source='parent_real_life_observation'
           ORDER BY observed_at DESC,id DESC LIMIT 5""",
        (goal_id,),
    ).fetchall()]
    return {
        "count": len(rows),
        "latest_result": rows[0]["result_type"] if rows else None,
        "latest_prompt_level": rows[0]["prompt_level"] if rows else None,
        "independent": sum(row["result_type"] == "independent" for row in rows),
        "with_help": sum(row["result_type"] == "with_help" for row in rows),
        "refusals": sum(row["result_type"] == "refused" for row in rows),
        "breaks": sum(row["result_type"] == "break" for row in rows),
    }


def _difficulty(
    exercise: dict,
    evidence: dict,
    parent_observations: dict,
    help_level: str,
    thresholds: PlannerThresholds,
) -> tuple[dict, list[str]]:
    completed = evidence["recorded_sessions"]
    accurate = evidence["accuracy"] is not None and evidence["accuracy"] >= thresholds.minimum_accuracy
    independent = evidence["independent_completions"] >= thresholds.minimum_independent_completions
    prompt_free = evidence["prompts_used"] == 0
    level = 1
    reason = ["Начинаем с минимальной нагрузки и доступной подсказки."]
    if completed >= thresholds.level_three_sessions and accurate and independent and prompt_free:
        level = 3
        reason = [f"Сложность повышена после {completed} отдельных завершённых практик с устойчивым самостоятельным выполнением."]
    elif completed >= thresholds.level_two_sessions and accurate and independent and prompt_free:
        level = 2
        reason = [f"Сложность повышена после {completed} отдельных завершённых практик; одной удачной попытки для этого недостаточно."]
    elif completed:
        reason = [f"Сохраняем спокойный уровень: данных для повышения пока недостаточно ({completed} из {thresholds.level_two_sessions} практик)."]
    else:
        reason = ["Сохраняем начальный уровень: предыдущих игровых данных пока нет."]

    if parent_observations["latest_result"] == "with_help" and level > 1:
        level = 1
        reason.append("Последнее бытовое наблюдение было с помощью, поэтому повышение пока не применяется.")

    levels = exercise["engine"]["content"].get("difficulty_levels") or []
    configured = next((item for item in levels if item.get("level") == level), None)
    if not configured and levels:
        configured = sorted(levels, key=lambda item: item.get("level", 1))[0]
        level = int(configured.get("level", 1))
    option_count = configured.get("option_count") if configured else None
    rounds = configured.get("rounds") if configured else 1
    recent_pause = (
        evidence["refusals"] + evidence["breaks"]
        + parent_observations["refusals"] + parent_observations["breaks"]
    ) > 0
    prompt_mode = "model_and_visual" if help_level == "full" else "visual" if help_level == "minimal" else "on_request"
    if parent_observations["latest_result"] == "with_help" and prompt_mode == "on_request":
        prompt_mode = "visual"
    params = {
        "difficulty_level": level,
        "option_count": option_count,
        "round_count": rounds,
        "instruction_step_count": 1,
        "action_count": 1,
        "prompt_mode": prompt_mode,
        "visual_diversity": "familiar" if recent_pause or completed < thresholds.level_two_sessions else "configured",
        "familiar_repetition": bool(recent_pause or completed < thresholds.level_two_sessions),
    }
    if recent_pause:
        reason.append("Недавний перерыв или отказ не считается ошибкой; выбран знакомый формат без повышения нагрузки.")
    return params, reason


def _exercise_reason(
    goal: dict,
    exercise: dict,
    evidence: dict,
    parent_observations: dict,
    difficulty_reason: list[str],
    preferred: bool,
) -> dict:
    reasons = [
        f"Связано с целью «{goal['title']}».",
        f"Упражнение тренирует наблюдаемое действие: {goal['observable_behavior']}",
        *difficulty_reason,
    ]
    if evidence["recorded_sessions"]:
        reasons.append(f"Это повтор знакомого упражнения; учтено практик: {evidence['recorded_sessions']}.")
    else:
        reasons.append("Это первое зарегистрированное использование упражнения для этой истории практики.")
    if preferred:
        reasons.append("Родитель отметил это упражнение как предпочтительное для ребёнка.")
    if parent_observations["count"]:
        observation_labels = {
            "not_observed": "навык пока не наблюдался",
            "independent": "самостоятельно",
            "with_help": "с помощью",
            "refused": "отказ",
            "break": "перерыв",
            "technical_error": "техническая ошибка",
        }
        latest = observation_labels.get(parent_observations["latest_result"], "добавлено наблюдение")
        reasons.append(f"Учтено последнее бытовое наблюдение родителя: {latest}. Оно не включено в игровой балл.")
    else:
        reasons.append("Домашнее наблюдение можно добавить отдельно; оно не превращается в игровой балл.")
    return {
        "codes": ["active_goal", "approved_version", "conservative_difficulty"] + (["child_preference"] if preferred else []),
        "messages": reasons,
        "evidence": {**evidence, "parent_observations": parent_observations},
    }


def _decode_plan(db, plan_id: int) -> dict:
    plan = dict(db.execute("SELECT * FROM adaptive_practice_plans WHERE id=?", (plan_id,)).fetchone())
    items = []
    for row in db.execute(
        """SELECT i.*,e.title exercise_title,e.instruction,e.module,e.target,e.skill,
                  v.version exercise_version
           FROM adaptive_practice_plan_items i
           JOIN exercises e ON e.id=i.exercise_id
           JOIN exercise_versions v ON v.id=i.exercise_version_id
           WHERE i.plan_id=? ORDER BY i.position,i.id""",
        (plan_id,),
    ).fetchall():
        item = dict(row)
        item["difficulty_params"] = _loads(item.pop("difficulty_params_json"), {})
        item["assignment_reason"] = _loads(item.pop("assignment_reason_json"), {})
        items.append(item)
    plan["items"] = items
    plan["notices"] = _loads(plan.pop("notices_json"), [])
    plan["thresholds"] = _loads(plan.pop("thresholds_json"), {})
    return plan


def create_plan(db, child_id: int, target_minutes: int, user_id: int, thresholds: PlannerThresholds = DEFAULT_THRESHOLDS) -> dict:
    target_count = {3: 2, 5: 3, 10: 5}[target_minutes]
    goals = [decode_goal(row) for row in db.execute(
        "SELECT * FROM parent_practice_goals WHERE child_id=? AND status='active' ORDER BY updated_at DESC,id",
        (child_id,),
    ).fetchall()]
    catalogue = [item for item in published_exercise_rows(db) if item["module"] != "motor"]
    preferences = get_preferences(db, child_id)
    preferred = set(preferences["preferred_exercise_ids"])
    avoided = set(preferences["avoided_exercise_ids"])
    recent_ids = [row["exercise_id"] for row in db.execute(
        """SELECT exercise_id FROM sessions WHERE child_id=? AND exercise_id IS NOT NULL
           ORDER BY id DESC LIMIT ?""",
        (child_id, thresholds.recent_repeat_window),
    ).fetchall()]

    candidates = []
    notices = []
    for goal in goals:
        targets = set(goal["matching_targets"])
        mechanics = set(goal["matching_mechanics"])
        parent_observations = _parent_observation_evidence(db, goal["id"])
        linked = [item for item in catalogue if item["target"] in targets and item["engine"]["mechanic"] in mechanics and item["id"] not in avoided]
        if not linked:
            notices.append({
                "goal_id": goal["id"],
                "goal_title": goal["title"],
                "message": "Для этой цели пока нет опубликованного и методически разрешённого упражнения. Случайная замена не назначена.",
            })
            continue
        for exercise in linked:
            evidence = _evidence(db, child_id, exercise["id"], thresholds)
            params, difficulty_reason = _difficulty(
                exercise, evidence, parent_observations, goal["help_level"], thresholds,
            )
            sort_key = (
                0 if exercise["id"] in preferred else 1,
                1 if exercise["id"] in recent_ids else 0,
                evidence["recorded_sessions"],
                exercise["id"],
            )
            candidates.append((sort_key, goal, exercise, params, _exercise_reason(
                goal, exercise, evidence, parent_observations, difficulty_reason, exercise["id"] in preferred,
            )))

    candidates.sort(key=lambda item: item[0])
    selected = []
    used_exercises: set[int] = set()
    covered_goals: set[int] = set()
    # First pass gives each goal one related item; second pass fills the time box.
    for only_new_goal in (True, False):
        for candidate in candidates:
            _, goal, exercise, params, reason = candidate
            if len(selected) >= target_count:
                break
            if exercise["id"] in used_exercises:
                continue
            if only_new_goal and goal["id"] in covered_goals:
                continue
            selected.append((goal, exercise, params, reason))
            used_exercises.add(exercise["id"])
            covered_goals.add(goal["id"])

    summary = (
        "Подобраны только опубликованные задания, связанные с активными домашними практическими целями."
        if selected else
        "Подходящих опубликованных заданий сейчас нет. План не заполнен случайными упражнениями."
    )
    if not goals:
        notices.append({"goal_id": None, "goal_title": None, "message": "Сначала добавьте хотя бы одну домашнюю практическую цель из подготовленного каталога."})
    stamp = now_iso()
    cursor = db.execute(
        """INSERT INTO adaptive_practice_plans(
               child_id,status,rules_version,target_minutes,summary,notices_json,thresholds_json,created_by,created_at)
           VALUES(?,'prepared',?,?,?,?,?,?,?) RETURNING id""",
        (
            child_id, RULES_VERSION, target_minutes, summary, json.dumps(notices, ensure_ascii=False),
            json.dumps(thresholds.__dict__, ensure_ascii=False), user_id, stamp,
        ),
    )
    plan_id = cursor.fetchone()["id"]
    for position, (goal, exercise, params, reason) in enumerate(selected):
        db.execute(
            """INSERT INTO adaptive_practice_plan_items(
                   plan_id,goal_id,goal_version,exercise_id,exercise_version_id,position,
                   difficulty_params_json,assignment_reason_json,created_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (
                plan_id, goal["id"], goal["version"], exercise["id"], exercise["engine"]["version_id"],
                position, json.dumps(params, ensure_ascii=False), json.dumps(reason, ensure_ascii=False), stamp,
            ),
        )
    return _decode_plan(db, plan_id)


def get_plan(db, plan_id: int, child_id: int) -> dict | None:
    row = db.execute("SELECT id FROM adaptive_practice_plans WHERE id=? AND child_id=?", (plan_id, child_id)).fetchone()
    return _decode_plan(db, plan_id) if row else None


def plan_history(db, child_id: int) -> list[dict]:
    return [_decode_plan(db, row["id"]) for row in db.execute(
        "SELECT id FROM adaptive_practice_plans WHERE child_id=? ORDER BY id DESC LIMIT 20",
        (child_id,),
    ).fetchall()]

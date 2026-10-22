"""Deterministic and explainable adaptive practice planning.

No model, external API or free-form AI output participates in selection.  The
planner uses a short, recency-weighted result window and rotates exercises so
an item is not assigned again while an unused related item is available.
Every item keeps the exact goal/exercise versions, parameters and reason used
at planning time.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .database import now_iso
from .exercise_engine import published_exercise_rows
from .practice_goals import decode_goal, get_preferences


RULES_VERSION = "p2.4-comparable-evidence-1"


@dataclass(frozen=True)
class PlannerThresholds:
    recent_window: int = 8
    evidence_max_age_days: int = 30
    level_two_sessions: int = 3
    level_three_sessions: int = 6
    minimum_accuracy: float = 0.76
    level_three_accuracy: float = 0.88
    minimum_independent_completions: int = 3
    minimum_level_two_independence_rate: float = 0.5
    minimum_level_three_independence_rate: float = 0.8
    oldest_result_weight: float = 1.0
    newest_result_weight: float = 2.0


DEFAULT_THRESHOLDS = PlannerThresholds()


def _loads(value: str | None, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


def _recency_weights(count: int, thresholds: PlannerThresholds) -> list[float]:
    """Return descending weights for rows ordered newest first.

    The newest result counts twice as much as the oldest result.  This keeps
    the planner responsive without letting one accidental miss erase a stable
    history.
    """
    if count <= 0:
        return []
    if count == 1:
        return [thresholds.newest_result_weight]
    distance = thresholds.newest_result_weight - thresholds.oldest_result_weight
    return [
        thresholds.newest_result_weight - distance * index / (count - 1)
        for index in range(count)
    ]


def _aggregate_results(rows: list[dict], thresholds: PlannerThresholds) -> dict:
    weights = _recency_weights(len(rows), thresholds)
    total_weight = sum(weights)
    accuracies = [row["independent_completions"] / row["attempts_count"] for row in rows]
    independence = [row["independent_completions"] / max(1, row["independent_completions"] + row["prompted_completions"]) for row in rows]
    attempts = sum(row["attempts_count"] for row in rows)
    return {
        "recorded_sessions": len(rows), "attempts": attempts,
        "accuracy": round(sum(row["correct_answers"] for row in rows) / attempts, 3) if attempts else None,
        "weighted_accuracy": round(sum(value * weight for value, weight in zip(accuracies, weights)) / total_weight, 3) if total_weight else None,
        "independent_completions": sum(row["independent_completions"] for row in rows),
        "weighted_independence_rate": round(sum(value * weight for value, weight in zip(independence, weights)) / total_weight, 3) if total_weight else None,
        "prompts_used": sum(row["prompts_used"] for row in rows),
        "recency_weights": [round(weight, 3) for weight in weights],
    }


def _evidence(db, child_id: int, exercise: dict, thresholds: PlannerThresholds) -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=thresholds.evidence_max_age_days)).isoformat()
    rows = [dict(row) for row in db.execute(
        """SELECT s.* FROM sessions s
           WHERE s.child_id=? AND s.exercise_id=? AND s.exercise_version_id=?
             AND s.created_at>=? AND s.measurement_version>=3
             AND s.attempt_status='completed' AND s.response_owner='child'
             AND s.support_context IN ('independent','caregiver_supported')
             AND s.attempts_count>0
           ORDER BY s.id DESC""",
        (child_id, exercise["id"], exercise["engine"]["version_id"], cutoff),
    ).fetchall()]
    configured_levels = exercise["engine"]["content"].get("difficulty_levels")
    if not configured_levels and exercise["engine"]["mechanic"] in {"auditory_choice", "action_choice"}:
        # Older published versions use the same explicit fallback as the runner.
        configured_levels = [{"level": level, "option_count": level + 1, "rounds": 4 if level == 1 else 5} for level in (1, 2, 3)]
    levels = {item["level"]: item for item in configured_levels or []}
    comparable = []
    for row in rows:
        details = _loads(row["details"], {})
        if not isinstance(details, dict):
            continue
        level = details.get("difficulty_level")
        if type(level) is not int or level not in levels:
            continue
        configured = levels[level]
        if (details.get("option_count") != configured["option_count"]
                or row["attempts_count"] != configured["rounds"]):
            continue
        row["difficulty_level"] = level
        comparable.append(row)
        if len(comparable) >= thresholds.recent_window:
            break
    statuses = [row["attempt_status"] for row in db.execute(
        """SELECT attempt_status FROM sessions WHERE child_id=? AND created_at>=?
           AND measurement_version>=1 AND response_owner='child'
           AND support_context IN ('independent','caregiver_supported','caregiver_modelled')
           ORDER BY id DESC LIMIT ?""",
        (child_id, cutoff, thresholds.recent_window),
    ).fetchall()]
    return {
        **_aggregate_results(comparable, thresholds),
        "level_two_or_higher": _aggregate_results([row for row in comparable if row["difficulty_level"] >= 2], thresholds),
        "refusals": statuses.count("refused"), "breaks": statuses.count("break"),
        "technical_errors": statuses.count("technical_error"),
        "exercise_id": exercise["id"], "exercise_version_id": exercise["engine"]["version_id"],
        "max_age_days": thresholds.evidence_max_age_days,
    }


def _assignment_history(db, child_id: int) -> dict[int, dict]:
    """Rotate recorded child attempts, never unplayed items in a prepared plan."""
    rows = db.execute(
        """SELECT exercise_id,created_at FROM sessions
           WHERE child_id=? AND exercise_id IS NOT NULL AND response_owner='child'
             AND support_context IN ('independent','caregiver_supported','caregiver_modelled')
             AND attempt_status IN ('completed','participated','refused','break')
           ORDER BY created_at DESC,id DESC""", (child_id,),
    ).fetchall()
    history: dict[int, dict] = {}
    for rank, row in enumerate(rows):
        item = history.setdefault(row["exercise_id"], {
            "assignment_count": 0, "last_assigned_at": row["created_at"], "last_assigned_rank": rank,
        })
        item["assignment_count"] += 1
    return history


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
    weighted_accuracy = evidence["weighted_accuracy"]
    independence_rate = evidence["weighted_independence_rate"]
    accurate = weighted_accuracy is not None and weighted_accuracy >= thresholds.minimum_accuracy
    harder = evidence.get("level_two_or_higher", {})
    harder_accuracy = harder.get("weighted_accuracy")
    harder_independence = harder.get("weighted_independence_rate")
    highly_accurate = harder_accuracy is not None and harder_accuracy >= thresholds.level_three_accuracy
    independent = evidence["independent_completions"] >= thresholds.minimum_independent_completions
    enough_independence = independence_rate is not None and independence_rate >= thresholds.minimum_level_two_independence_rate
    high_independence = harder_independence is not None and harder_independence >= thresholds.minimum_level_three_independence_rate
    level = 1
    reason = ["Начинаем с минимальной нагрузки и доступной подсказки."]
    if harder.get("recorded_sessions", 0) >= thresholds.level_three_sessions and highly_accurate and independent and high_independence and weighted_accuracy is not None and weighted_accuracy >= thresholds.level_three_accuracy:
        level = 3
        reason = [f"Уровень 3 выбран по {harder['recorded_sessions']} сопоставимым результатам уровня 2 или выше: точность первого ответа {round(harder_accuracy * 100)}%, самостоятельность {round(harder_independence * 100)}%."]
    elif completed >= thresholds.level_two_sessions and accurate and independent and enough_independence:
        level = 2
        reason = [f"Уровень 2 выбран по {completed} последним результатам: взвешенная точность первого ответа {round(weighted_accuracy * 100)}%; свежие ответы имеют больший вес."]
    elif completed:
        accuracy_note = f", взвешенная точность первого ответа {round(weighted_accuracy * 100)}%" if weighted_accuracy is not None else ""
        reason = [f"Сохраняем спокойный уровень: устойчивых данных для повышения пока недостаточно ({completed} из {thresholds.level_two_sessions} практик{accuracy_note})."]
    else:
        reason = ["Сохраняем начальный уровень: сопоставимых результатов этой версии за последние 30 дней пока нет."]

    if parent_observations["latest_result"] == "with_help" and level > 1:
        level = 1
        reason.append("Последнее бытовое наблюдение было с помощью, поэтому повышение пока не применяется.")

    recent_pause = (
        evidence["refusals"] + evidence["breaks"]
        + parent_observations["refusals"] + parent_observations["breaks"]
    ) > 0
    if recent_pause:
        level = 1
        reason = ["Недавний перерыв или отказ не считается ошибкой; возвращаемся к начальному уровню нагрузки."]
    mechanic = exercise["engine"]["mechanic"]
    if mechanic not in {"auditory_choice", "action_choice"}:
        level = 1
        reason = ["Используется фиксированный формат задания; игровое участие не считается ростом речевого навыка."]
    levels = exercise["engine"]["content"].get("difficulty_levels") or []
    configured = next((item for item in levels if item.get("level") == level), None)
    if not configured and levels and mechanic in {"auditory_choice", "action_choice"}:
        configured = sorted(levels, key=lambda item: item.get("level", 1))[0]
        level = int(configured.get("level", 1))
    if mechanic in {"auditory_choice", "action_choice"}:
        option_count = configured["option_count"] if configured else level + 1
        rounds = configured["rounds"] if configured else (4 if level == 1 else 5)
    else:
        option_count = None
        rounds = len(exercise["engine"]["content"].get("scenarios", [])) or 1
    params = {
        "difficulty_level": level,
        "option_count": option_count,
        "round_count": rounds,
        "instruction_step_count": 1,
        "action_count": 1,
    }
    return params, reason


def _exercise_reason(
    goal: dict,
    exercise: dict,
    evidence: dict,
    parent_observations: dict,
    difficulty_reason: list[str],
    preferred: bool,
    assignment_history: dict,
) -> dict:
    reasons = [
        f"Связано с целью «{goal['title']}».",
        f"Упражнение тренирует наблюдаемое действие: {goal['observable_behavior']}",
        *difficulty_reason,
        "Для повышения используются только сопоставимые ответы этого задания и версии за последние 30 дней; это правило подбора, а не оценка развития.",
    ]
    if assignment_history["assignment_count"]:
        reasons.append(
            f"У упражнения есть {assignment_history['assignment_count']} сохранённых попыток; "
            "ротация выбрала его только с учётом ещё не показанных и реже использованных заданий."
        )
    else:
        reasons.append("У этого упражнения ещё нет сохранённых попыток ребёнка; оно имеет приоритет в ротации.")
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
        "codes": [
            "active_goal", "approved_version", "weighted_recent_results",
            "exercise_rotation", "conservative_difficulty",
            "new_exercise" if assignment_history["assignment_count"] == 0 else "least_used_exercise",
        ] + (["child_preference"] if preferred else []),
        "messages": reasons,
        "evidence": {
            **evidence,
            "assignment_count_before": assignment_history["assignment_count"],
            "last_assigned_at": assignment_history.get("last_assigned_at"),
            "parent_observations": parent_observations,
        },
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


def create_plan(db, child_id: int, target_minutes: int, user_id: int, thresholds: PlannerThresholds = DEFAULT_THRESHOLDS, *, persist: bool = True) -> dict:
    target_count = {3: 2, 5: 3, 10: 5}[target_minutes]
    goals = [decode_goal(row) for row in db.execute(
        "SELECT * FROM parent_practice_goals WHERE child_id=? AND status='active' ORDER BY updated_at DESC,id",
        (child_id,),
    ).fetchall()]
    catalogue = [item for item in published_exercise_rows(db) if item["module"] != "motor"]
    preferences = get_preferences(db, child_id)
    preferred = set(preferences["preferred_exercise_ids"])
    avoided = set(preferences["avoided_exercise_ids"])
    assignment_history = _assignment_history(db, child_id)

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
            evidence = _evidence(db, child_id, exercise, thresholds)
            params, difficulty_reason = _difficulty(
                exercise, evidence, parent_observations, goal["help_level"], thresholds,
            )
            use = assignment_history.get(exercise["id"], {
                "assignment_count": 0,
                "last_assigned_at": None,
                "last_assigned_rank": 10**9,
            })
            sort_key = (
                0 if use["assignment_count"] == 0 else 1,
                use["assignment_count"],
                0 if exercise["id"] in preferred else 1,
                -use["last_assigned_rank"],
                exercise["id"],
            )
            candidates.append((sort_key, goal, exercise, params, _exercise_reason(
                goal, exercise, evidence, parent_observations, difficulty_reason,
                exercise["id"] in preferred, use,
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
        "Подобраны только опубликованные задания по активным целям. Последние результаты взвешены по свежести, а новые и реже использованные упражнения получили приоритет."
        if selected else
        "Подходящих опубликованных заданий сейчас нет. План не заполнен случайными упражнениями."
    )
    if not goals:
        notices.append({"goal_id": None, "goal_title": None, "message": "Сначала добавьте хотя бы одну домашнюю практическую цель из подготовленного каталога."})
    if not persist:
        return {"exercises": [exercise for _, exercise, _, _ in selected], "notices": notices}
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


def plan_history(db, child_id: int, *, full: bool = False) -> list[dict]:
    return [_decode_plan(db, row["id"]) for row in db.execute(
        "SELECT id FROM adaptive_practice_plans WHERE child_id=? ORDER BY id DESC" + ("" if full else " LIMIT 20"),
        (child_id,),
    ).fetchall()]

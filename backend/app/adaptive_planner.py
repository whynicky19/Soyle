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

from .database import now_iso
from .exercise_engine import published_exercise_rows
from .practice_goals import decode_goal, get_preferences


RULES_VERSION = "p2.2-weighted-rotation-1"


@dataclass(frozen=True)
class PlannerThresholds:
    recent_window: int = 8
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


def _evidence(db, child_id: int, targets: list[str], thresholds: PlannerThresholds) -> dict:
    if not targets:
        return {
            "recorded_sessions": 0, "attempts": 0, "accuracy": None,
            "weighted_accuracy": None, "independent_completions": 0,
            "weighted_independence_rate": None, "prompts_used": 0,
            "refusals": 0, "breaks": 0, "technical_errors": 0,
            "recency_weights": [],
        }
    placeholders = ",".join("?" for _ in targets)
    rows = [dict(row) for row in db.execute(
        f"""SELECT s.id,s.attempt_status,s.attempts_count,s.correct_answers,s.prompts_used,
                   s.independent_completions,s.prompted_completions,s.prompt_level,s.created_at
            FROM sessions s JOIN exercises e ON e.id=s.exercise_id
            WHERE s.child_id=? AND e.target IN ({placeholders})
              AND s.measurement_version>=1 AND s.attempt_status='completed'
              AND s.response_owner='child'
              AND s.support_context IN ('independent','caregiver_supported')
              AND s.attempts_count>0
            ORDER BY s.id DESC LIMIT ?""",
        (child_id, *targets, thresholds.recent_window),
    ).fetchall()]
    status_rows = [row["attempt_status"] for row in db.execute(
        f"""SELECT s.attempt_status FROM sessions s JOIN exercises e ON e.id=s.exercise_id
            WHERE s.child_id=? AND e.target IN ({placeholders}) AND s.measurement_version>=1
              AND s.response_owner='child'
              AND s.support_context IN ('independent','caregiver_supported')
            ORDER BY s.id DESC LIMIT ?""",
        (child_id, *targets, thresholds.recent_window),
    ).fetchall()]
    weights = _recency_weights(len(rows), thresholds)
    total_weight = sum(weights)
    session_accuracies = [
        min(1.0, max(0.0, (row.get("correct_answers") or 0) / (row.get("attempts_count") or 1)))
        for row in rows
    ]
    independence_rates = []
    for row in rows:
        independent = row.get("independent_completions") or 0
        prompted = row.get("prompted_completions") or 0
        resolved = independent + prompted
        if resolved:
            independence_rates.append(min(1.0, max(0.0, independent / resolved)))
        else:
            independence_rates.append(1.0 if (row.get("prompts_used") or 0) == 0 else 0.0)
    attempts = sum(row.get("attempts_count") or 0 for row in rows)
    correct = sum(row.get("correct_answers") or 0 for row in rows)
    return {
        "recorded_sessions": len(rows),
        "attempts": attempts,
        "accuracy": round(correct / attempts, 3) if attempts else None,
        "weighted_accuracy": round(sum(value * weight for value, weight in zip(session_accuracies, weights)) / total_weight, 3) if total_weight else None,
        "independent_completions": sum(row.get("independent_completions") or 0 for row in rows),
        "weighted_independence_rate": round(sum(value * weight for value, weight in zip(independence_rates, weights)) / total_weight, 3) if total_weight else None,
        "prompts_used": sum(row.get("prompts_used") or 0 for row in rows),
        "refusals": sum(status == "refused" for status in status_rows),
        "breaks": sum(status == "break" for status in status_rows),
        "technical_errors": sum(status == "technical_error" for status in status_rows),
        "recency_weights": [round(weight, 3) for weight in weights],
    }


def _assignment_history(db, child_id: int) -> dict[int, dict]:
    """Count prior assignments without double-counting adaptive completions."""
    rows = db.execute(
        """SELECT i.exercise_id,i.created_at
           FROM adaptive_practice_plan_items i
           JOIN adaptive_practice_plans p ON p.id=i.plan_id
           WHERE p.child_id=?
           UNION ALL
           SELECT s.exercise_id,s.created_at
           FROM sessions s
           WHERE s.child_id=? AND s.exercise_id IS NOT NULL
             AND s.adaptive_plan_item_id IS NULL
             AND s.response_owner='child'
             AND s.support_context IN ('independent','caregiver_supported')
           ORDER BY created_at DESC""",
        (child_id, child_id),
    ).fetchall()
    history: dict[int, dict] = {}
    for rank, row in enumerate(rows):
        item = history.setdefault(row["exercise_id"], {
            "assignment_count": 0,
            "last_assigned_at": row["created_at"],
            "last_assigned_rank": rank,
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
    highly_accurate = weighted_accuracy is not None and weighted_accuracy >= thresholds.level_three_accuracy
    independent = evidence["independent_completions"] >= thresholds.minimum_independent_completions
    enough_independence = independence_rate is not None and independence_rate >= thresholds.minimum_level_two_independence_rate
    high_independence = independence_rate is not None and independence_rate >= thresholds.minimum_level_three_independence_rate
    level = 1
    reason = ["Начинаем с минимальной нагрузки и доступной подсказки."]
    if completed >= thresholds.level_three_sessions and highly_accurate and independent and high_independence:
        level = 3
        reason = [f"Уровень 3 выбран по {completed} последним результатам: взвешенная точность {round(weighted_accuracy * 100)}%, самостоятельность {round(independence_rate * 100)}%."]
    elif completed >= thresholds.level_two_sessions and accurate and independent and enough_independence:
        level = 2
        reason = [f"Уровень 2 выбран по {completed} последним результатам: взвешенная точность {round(weighted_accuracy * 100)}%; свежие ответы имеют больший вес."]
    elif completed:
        accuracy_note = f", взвешенная точность {round(weighted_accuracy * 100)}%" if weighted_accuracy is not None else ""
        reason = [f"Сохраняем спокойный уровень: устойчивых данных для повышения пока недостаточно ({completed} из {thresholds.level_two_sessions} практик{accuracy_note})."]
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
    assignment_history: dict,
) -> dict:
    reasons = [
        f"Связано с целью «{goal['title']}».",
        f"Упражнение тренирует наблюдаемое действие: {goal['observable_behavior']}",
        *difficulty_reason,
    ]
    if assignment_history["assignment_count"]:
        reasons.append(
            f"Упражнение уже назначалось {assignment_history['assignment_count']} раз(а); "
            "ротация выбрала его только с учётом ещё не показанных и реже использованных заданий."
        )
    else:
        reasons.append("Это упражнение ещё не выдавалось ребёнку; новые задания имеют приоритет.")
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
    assignment_history = _assignment_history(db, child_id)

    candidates = []
    notices = []
    for goal in goals:
        targets = set(goal["matching_targets"])
        mechanics = set(goal["matching_mechanics"])
        parent_observations = _parent_observation_evidence(db, goal["id"])
        evidence = _evidence(db, child_id, sorted(targets), thresholds)
        linked = [item for item in catalogue if item["target"] in targets and item["engine"]["mechanic"] in mechanics and item["id"] not in avoided]
        if not linked:
            notices.append({
                "goal_id": goal["id"],
                "goal_title": goal["title"],
                "message": "Для этой цели пока нет опубликованного и методически разрешённого упражнения. Случайная замена не назначена.",
            })
            continue
        for exercise in linked:
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

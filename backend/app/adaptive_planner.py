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
from fastapi import HTTPException

from .database import now_iso
from .exercise_engine import published_exercise_rows
from .practice_goals import decode_goal, exercise_matches_goal, get_preferences
from .recommendations import recommendations
from .practice_results import measured_result, verified_outcomes, compatible_goal_versions


RULES_VERSION = "p2.7-word-transfer-1"


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
    decrease_sessions: int = 3
    decrease_independent_accuracy: float = 0.60
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
    total_weight = sum(row["attempts_count"] * weight for row, weight in zip(rows, weights))
    question_weight = sum(row.get("question_count",row["attempts_count"]) * weight for row, weight in zip(rows, weights))
    completed_weight = sum((row["independent_completions"] + row["prompted_completions"]) * weight for row, weight in zip(rows, weights))
    independent_weight = sum(row["independent_completions"] * weight for row, weight in zip(rows, weights))
    attempts = sum(row["attempts_count"] for row in rows)
    return {
        "recorded_sessions": len(rows), "attempts": attempts,
        "accuracy": round(sum(row["correct_answers"] for row in rows) / attempts, 3) if attempts else None,
        "weighted_accuracy": round(sum(row["correct_answers"] * weight for row, weight in zip(rows, weights)) / total_weight, 3) if total_weight else None,
        "weighted_independent_accuracy": round(independent_weight / question_weight, 3) if question_weight else None,
        "independent_completions": sum(row["independent_completions"] for row in rows),
        "weighted_independence_rate": round(independent_weight / completed_weight, 3) if completed_weight else None,
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
             AND s.support_context IN ('independent','caregiver_supported','caregiver_modelled')
             AND s.attempts_count>0
           ORDER BY s.id DESC""",
        (child_id, exercise["id"], exercise["engine"]["version_id"], cutoff),
    ).fetchall()]
    configured_levels = exercise["engine"]["content"].get("difficulty_levels")
    if not configured_levels and exercise["engine"]["mechanic"] in {"auditory_choice", "action_choice"}:
        # Older published versions use the same explicit fallback as the runner.
        configured_levels = [{"level": level, "option_count": level + 1, "rounds": 12} for level in (1, 2, 3)]
    levels = {item["level"]: item for item in configured_levels or []}
    comparable = []
    for row in rows:
        details = _loads(row["details"], {})
        if not measured_result(row) or not isinstance(details, dict):
            continue
        if exercise['engine']['mechanic'] == 'scene_search':
            verified=db.execute('SELECT r.state_json FROM exploration_submissions x JOIN exploration_runs r ON r.id=x.run_id WHERE x.session_id=?',(row['id'],)).fetchone()
            if not verified:continue
            state=_loads(verified['state_json'],{})
            if state.get('status')!='completed' or state.get('accessible_labels') or details.get('difficulty_level') not in (1,2,3):continue
            row['difficulty_level']=details['difficulty_level'];row['question_count']=len(state['outcomes']);comparable.append(row)
            if len(comparable)>=thresholds.recent_window:break
            continue
        if exercise['engine']['mechanic'] in {'category_sort', 'action_sequence', 'object_match', 'tap_instruction'}:
            content = exercise['engine']['content']
            if (details.get('mechanic') != exercise['engine']['mechanic']
                    or details.get('round_count') != row['attempts_count']
                    or row['attempts_count'] not in content.get('round_choices', [])
                    or not verified_outcomes(row)):
                continue
            row['difficulty_level'] = 1
            comparable.append(row)
            if len(comparable) >= thresholds.recent_window:
                break
            continue
        level = details.get("difficulty_level")
        if type(level) is not int or level not in levels:
            continue
        configured = levels[level]
        if (details.get("option_count") != configured["option_count"]
                or row["attempts_count"] != details.get("round_count", configured["rounds"])
                or (row["attempts_count"] != configured["rounds"] and not (
                    exercise["engine"]["content"].get("max_rounds")
                    and configured["rounds"] <= row["attempts_count"] <= exercise["engine"]["content"]["max_rounds"]
                    and row["attempts_count"] % 6 == 0))):
            continue
        row["difficulty_level"] = level
        comparable.append(row)
        if len(comparable) >= thresholds.recent_window:
            break
    statuses = [row["attempt_status"] for row in db.execute(
        """SELECT attempt_status FROM sessions WHERE child_id=? AND exercise_id=? AND created_at>=?
           AND measurement_version>=1 AND response_owner='child'
           AND support_context IN ('independent','caregiver_supported','caregiver_modelled')
           ORDER BY id DESC LIMIT ?""",
        (child_id, exercise["id"], cutoff, thresholds.recent_window),
    ).fetchall()]
    current_level = comparable[0]["difficulty_level"] if comparable else 1
    current_run = []
    for row in comparable:
        if row["difficulty_level"] != current_level:
            break
        current_run.append(row)
    return {
        **_aggregate_results(comparable, thresholds),
        "current_level": current_level,
        "current_level_results": _aggregate_results(current_run, thresholds),
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


def _parent_observation_evidence(db, goal_id: int, thresholds: PlannerThresholds = DEFAULT_THRESHOLDS) -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=thresholds.evidence_max_age_days)).isoformat()
    goal = decode_goal(db.execute("SELECT * FROM parent_practice_goals WHERE id=?", (goal_id,)).fetchone())
    versions = compatible_goal_versions(db, goal)
    placeholders = ",".join("?" for _ in versions)
    rows = [dict(row) for row in db.execute(
        f"""SELECT result_type,prompt_level,observed_at
           FROM practice_goal_observations
           WHERE goal_id=? AND source='parent_real_life_observation'
             AND goal_version IN ({placeholders})
             AND observed_at>=? AND observed_at<=?
           ORDER BY observed_at DESC,id DESC LIMIT 5""",
        (goal_id, *versions, cutoff, now_iso()),
    ).fetchall()]
    actionable = next((row for row in rows if row["result_type"] in {"independent", "with_help", "not_observed"}), None)
    return {
        "count": len(rows),
        "latest_skill_result": actionable["result_type"] if actionable else None,
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
    current = evidence.get("current_level", 1)
    recent = evidence.get("current_level_results", evidence)
    level = current
    completed = recent["recorded_sessions"]
    accuracy = recent.get("weighted_independent_accuracy", recent["weighted_accuracy"])
    independence = recent["weighted_independence_rate"]
    enough_independent = recent["independent_completions"] >= thresholds.minimum_independent_completions
    reason = [f"Сохраняем уровень {current}: сопоставимых результатов на этом уровне пока недостаточно."]
    if current > 1 and completed >= thresholds.decrease_sessions and accuracy is not None and accuracy < thresholds.decrease_independent_accuracy:
        level = current - 1
        reason = [f"Уменьшаем сложность на один уровень после {completed} сопоставимых практик: самостоятельно выполнено {round(accuracy * 100)}% раундов. Перерывы и отказы сюда не входят."]
    elif current < 3:
        required = thresholds.level_two_sessions if current == 1 else thresholds.level_three_sessions
        accuracy_threshold = thresholds.minimum_accuracy if current == 1 else thresholds.level_three_accuracy
        independence_threshold = thresholds.minimum_level_two_independence_rate if current == 1 else thresholds.minimum_level_three_independence_rate
        if completed >= required and accuracy is not None and accuracy >= accuracy_threshold and enough_independent and independence is not None and independence >= independence_threshold:
            level = current + 1
            reason = [f"Повышаем сложность на один уровень по {completed} сопоставимым результатам уровня {current}: самостоятельно выполнено {round(accuracy * 100)}% раундов; свежие ответы имеют больший вес."]
        elif completed:
            reason = [f"Сохраняем уровень {current}: для повышения нужны {required} устойчивых результата именно этого уровня; сейчас {completed}."]
    else:
        reason = ["Сохраняем уровень 3. Один неудачный результат не обнуляет предыдущую практику."]

    if parent_observations.get("latest_skill_result", parent_observations["latest_result"]) == "with_help" and level > current:
        level = current
        reason.append("Свежему бытовому наблюдению нужна помощь: повышение отложено, текущий уровень сохранён.")

    recent_pause = (
        evidence["refusals"] + evidence["breaks"]
        + parent_observations["refusals"] + parent_observations["breaks"]
    ) > 0
    if recent_pause:
        reason.append("Перерыв и отказ не снижают сложность и не считаются ошибкой. Нагрузку занятия можно уменьшить отдельно.")
    mechanic = exercise["engine"]["mechanic"]
    if mechanic not in {"auditory_choice", "action_choice", "scene_search"}:
        level = 1
        reason = ["Используется фиксированный формат задания; игровое участие не считается ростом речевого навыка."]
    levels = exercise["engine"]["content"].get("difficulty_levels") or []
    configured = next((item for item in levels if item.get("level") == level), None)
    if not configured and levels and mechanic in {"auditory_choice", "action_choice"}:
        configured = sorted(levels, key=lambda item: item.get("level", 1))[0]
        level = int(configured.get("level", 1))
    if mechanic in {"auditory_choice", "action_choice"}:
        option_count = configured["option_count"] if configured else level + 1
        rounds = configured["rounds"] if configured else 12
    else:
        option_count = None
        rounds = exercise["engine"]["content"].get("default_rounds") or len(exercise["engine"]["content"].get("scenarios", [])) or 1
    tasks = exercise['engine']['content'].get('tasks', [])[:rounds]
    step_count = max((len(task.get('correct_order', [])) for task in tasks), default=1) if mechanic == 'action_sequence' else 1
    action_count = max((len(task.get('pairs', [])) for task in tasks), default=1) if mechanic == 'object_match' else step_count
    params = {
        "difficulty_level": level,
        "option_count": option_count,
        "round_count": rounds,
        "instruction_step_count": step_count,
        "action_count": action_count,
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


def create_plan(db, child_id: int, target_minutes: int, user_id: int, thresholds: PlannerThresholds = DEFAULT_THRESHOLDS, *, persist: bool = True, recommendation_id: int | None = None) -> dict:
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
    accepted = [item for item in recommendations(db, child_id) if item["ready_for_plan"]]
    if recommendation_id is not None:
        accepted = [item for item in accepted if item["id"] == recommendation_id]
        if not accepted:
            raise HTTPException(409, "Сначала примите доступную рекомендацию и свяжите её с активной целью")
    recommended = {}
    for item in accepted:
        recommended.setdefault((item["goal_id"], item["exercise_id"]), item)

    candidates = []
    notices = []
    latest = db.execute("""SELECT attempt_status FROM sessions WHERE child_id=? AND response_owner='child'
        AND support_context<>'unknown' AND created_at>=? ORDER BY id DESC LIMIT 1""",
        (child_id, (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat())).fetchone()
    if latest and latest["attempt_status"] in {"break", "refused"}:
        target_count = min(target_count, 2)
        notices.append({"goal_id": None, "goal_title": None, "message": "После недавнего перерыва или отказа предлагаем не больше двух заданий. Уровень сложности сохранён по игровым ответам; можно снова остановиться в любой момент."})
    for goal in goals:
        if recommendation_id is not None and goal["id"] != accepted[0]["goal_id"]:
            continue
        parent_observations = _parent_observation_evidence(db, goal["id"], thresholds)
        linked = [item for item in catalogue if exercise_matches_goal(item, goal) and item["id"] not in avoided
                  and (recommendation_id is None or (goal["id"], item["id"]) in recommended)]
        if not linked:
            excluded = any(exercise_matches_goal(item, goal) and item["id"] in avoided for item in catalogue)
            notices.append({
                "goal_id": goal["id"],
                "goal_title": goal["title"],
                "message": ("Все подходящие опубликованные задания исключены в предпочтениях ребёнка. Проверьте отметки «Пока не предлагать»."
                            if excluded else "Для этой цели пока нет опубликованного упражнения. Случайная замена не назначена."),
            })
            continue
        for exercise in linked:
            recommendation = recommended.get((goal["id"], exercise["id"]))
            evidence = _evidence(db, child_id, exercise, thresholds)
            params, difficulty_reason = _difficulty(
                exercise, evidence, parent_observations, goal["help_level"], thresholds,
            )
            from .vocabulary import focus_for_exercise
            focus=focus_for_exercise(db,child_id,exercise)
            params.update(focus)
            if exercise['engine']['mechanic']=='scene_search' and params['difficulty_level']==1:
                large={o['id'] for o in exercise['engine']['content']['exploration']['objects'] if o['beginner']}
                if any(key not in large for key in focus['preferred_stimulus_keys']):
                    params['difficulty_level']=2
                    difficulty_reason.append('После самостоятельных карточных проб возвращаем конкретное слово в полную сцену с простой инструкцией.')
            use = assignment_history.get(exercise["id"], {
                "assignment_count": 0,
                "last_assigned_at": None,
                "last_assigned_rank": 10**9,
            })
            sort_key = (
                0 if recommendation else 1,
                0 if focus['preferred_stimulus_keys'] else 1,
                0 if use["assignment_count"] == 0 else 1,
                use["assignment_count"],
                0 if exercise["id"] in preferred else 1,
                -use["last_assigned_rank"],
                exercise["id"],
            )
            reason = _exercise_reason(
                goal, exercise, evidence, parent_observations, difficulty_reason,
                exercise["id"] in preferred, use,
            )
            if focus['preferred_stimulus_keys']:
                reason['codes'].append('vocabulary_reinforcement')
                reason['messages'].extend(focus['vocabulary_reason'])
                reason['evidence']['word_concept_ids']=focus['word_concept_ids']
            if recommendation:
                reason["recommendation_id"] = recommendation["id"]
                reason["codes"].append("family_accepted_recommendation")
                reason["messages"].insert(0, f"Родитель включил рекомендацию специалиста {recommendation['specialist_name']} в практику по этой цели.")
            candidates.append((sort_key, goal, exercise, params, reason))

    candidates.sort(key=lambda item: item[0])
    selected = []
    used_exercises: set[int] = set()
    covered_goals: set[int] = set()
    used_banks: set[str] = set()
    # First pass gives each goal one related item; second pass fills the time box.
    for only_new_goal in (True, False):
        for candidate in candidates:
            _, goal, exercise, params, reason = candidate
            if len(selected) >= target_count:
                break
            bank_key = exercise["engine"]["content"].get("bank_key") or f"exercise-{exercise['id']}"
            if exercise["id"] in used_exercises or bank_key in used_banks:
                continue
            if only_new_goal and goal["id"] in covered_goals:
                continue
            selected.append((goal, exercise, params, reason))
            used_exercises.add(exercise["id"])
            used_banks.add(bank_key)
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
                   difficulty_params_json,assignment_reason_json,created_at,recommendation_id)
               VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (
                plan_id, goal["id"], goal["version"], exercise["id"], exercise["engine"]["version_id"],
                position, json.dumps(params, ensure_ascii=False), json.dumps(reason, ensure_ascii=False), stamp, reason.get("recommendation_id"),
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

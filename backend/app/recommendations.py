"""Family-approved recommendations linked to goals, plans and individual attempts."""
from fastapi import HTTPException

from .exercise_engine import published_exercise_rows
from .practice_goals import decode_goal, exercise_matches_goal, get_preferences


def recommendations(db, child_id: int, specialist_id: int | None = None) -> list[dict]:
    catalogue = {item["id"]: item for item in published_exercise_rows(db)}
    avoided = set(get_preferences(db, child_id)["avoided_exercise_ids"])
    goals = [decode_goal(row) for row in db.execute(
        "SELECT * FROM parent_practice_goals WHERE child_id=? AND status='active' ORDER BY id", (child_id,),
    ).fetchall()]
    rows = db.execute("""SELECT r.*,u.full_name specialist_name,e.title exercise_title,g.title goal_title,
        CASE WHEN r.status IN ('approved','edited') AND u.role='specialist' AND u.is_active=1
             AND sc.specialist_id IS NOT NULL AND c.privacy_accepted=1 AND c.specialist_sharing=1
             THEN 1 ELSE 0 END is_current
        FROM specialist_recommendations r JOIN users u ON u.id=r.specialist_id
        LEFT JOIN exercises e ON e.id=r.exercise_id
        LEFT JOIN parent_practice_goals g ON g.id=r.goal_id
        LEFT JOIN specialist_children sc ON sc.specialist_id=r.specialist_id AND sc.child_id=r.child_id
        LEFT JOIN child_consents c ON c.child_id=r.child_id
        WHERE r.child_id=?""" + (" AND r.specialist_id=?" if specialist_id is not None else "") + " ORDER BY r.id DESC",
        (child_id, specialist_id) if specialist_id is not None else (child_id,),
    ).fetchall()
    attempts = {}
    for raw in db.execute("""SELECT id,recommendation_id,attempt_status,created_at,attempts_count,
        correct_answers,independent_completions,prompted_completions,prompt_level
        FROM sessions WHERE child_id=? AND recommendation_id IS NOT NULL
        AND response_owner='child' ORDER BY id DESC""", (child_id,)).fetchall():
        item = dict(raw)
        attempts.setdefault(item["recommendation_id"], []).append(item)
    result = []
    for row in rows:
        item = dict(row)
        item["is_current"] = bool(item["is_current"])
        exercise = catalogue.get(item["exercise_id"])
        item["exercise_available"] = bool(exercise and exercise["id"] not in avoided
            and (item["exercise_version_id"] is None or item["exercise_version_id"] == exercise["engine"]["version_id"]))
        item["suitable_goals"] = [{"id": goal["id"], "title": goal["title"]} for goal in goals
            if exercise and exercise_matches_goal(exercise, goal)]
        item["goal_available"] = any(goal["id"] == item["goal_id"] for goal in item["suitable_goals"])
        history = attempts.get(item["id"], [])
        item["latest_attempt"] = history[0] if history else None
        item["attempt_count"] = len(history)
        item["completed_at"] = next((attempt["created_at"] for attempt in history
            if attempt["attempt_status"] in {"completed", "participated"}), None)
        item["ready_for_plan"] = bool(item["is_current"] and item["exercise_available"]
            and item["goal_available"] and item["family_decision"] == "accepted" and not item["completed_at"])
        result.append(item)
    return result


def validate_recommendation(db, child_id: int, recommendation_id: int, exercise_id: int,
                            version_id: int, goal_id: int) -> dict:
    item = next((item for item in recommendations(db, child_id) if item["id"] == recommendation_id), None)
    if (not item or not item["ready_for_plan"] or item["exercise_id"] != exercise_id
            or item["exercise_version_id"] != version_id or item["goal_id"] != goal_id):
        raise HTTPException(409, "Рекомендация изменилась или больше недоступна. Подготовьте новый план")
    return item

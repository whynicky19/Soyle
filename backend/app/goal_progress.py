"""Practice evidence attached to comparable versions of one goal, never a mastery score."""
from datetime import datetime, timedelta, timezone

from .practice_results import measured_result, compatible_goal_versions


def goal_progress(db, goal: dict) -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    versions = compatible_goal_versions(db, goal)
    placeholders = ",".join("?" for _ in versions)
    rows = [dict(row) for row in db.execute(
        f"""SELECT s.* FROM sessions s
           JOIN adaptive_practice_plan_items i ON i.id=s.adaptive_plan_item_id
           WHERE s.child_id=? AND i.goal_id=? AND i.goal_version IN ({placeholders})
             AND s.created_at>=? AND s.response_owner='child'
             AND s.support_context IN ('independent','caregiver_supported','caregiver_modelled')
           ORDER BY s.id DESC""",
        (goal["child_id"], goal["id"], *versions, cutoff),
    ).fetchall()]
    measured = [row for row in rows if measured_result(row)]
    attempts = sum(row["attempts_count"] for row in measured)
    independent = sum(row["independent_completions"] for row in measured)
    prompted = sum(row["prompted_completions"] for row in measured)
    observations = [dict(row) for row in db.execute(
        f"""SELECT result_type FROM practice_goal_observations
           WHERE child_id=? AND goal_id=? AND goal_version IN ({placeholders}) AND observed_at>=? AND observed_at<=?""",
        (goal["child_id"], goal["id"], *versions, cutoff, datetime.now(timezone.utc).isoformat()),
    ).fetchall()]
    return {
        "window_days": 30, "goal_version": goal["version"],
        "completed_sessions": len(measured), "rounds": attempts,
        "independent": independent, "prompted": prompted,
        "without_child_answer": attempts - independent - prompted,
        "independent_rate": round(independent / attempts * 100) if attempts else None,
        "breaks": sum(row["attempt_status"] == "break" for row in rows),
        "refusals": sum(row["attempt_status"] == "refused" for row in rows),
        "technical_errors": sum(row["attempt_status"] == "technical_error" for row in rows),
        "participations": sum(row["attempt_status"] == "participated" for row in rows),
        "home_observations": len(observations),
        "home_independent": sum(row["result_type"] == "independent" for row in observations),
    }

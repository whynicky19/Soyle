"""Shared result interpretation for goal history and adaptive selection."""
from __future__ import annotations

import json


def result_details(row: dict) -> dict:
    try:
        value = json.loads(row.get("details") or "{}")
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def verified_outcomes(row: dict) -> bool:
    details = result_details(row)
    outcomes = details.get("round_outcomes", details.get("scenario_outcomes"))
    if not isinstance(outcomes, list) or len(outcomes) != row.get("attempts_count"):
        return False
    if any(not isinstance(item, dict) or item.get("outcome") not in {"independent", "prompted", "modelled"} for item in outcomes):
        return False
    independent = sum(item["outcome"] == "independent" for item in outcomes)
    prompted = sum(item["outcome"] == "prompted" for item in outcomes)
    return (independent == row.get("independent_completions")
            and prompted == row.get("prompted_completions")
            and independent + prompted == row.get("correct_answers"))


def measured_result(row: dict) -> bool:
    """A mixed series with a model is usable only with reconciled round data.

    The modelled rounds stay in the denominator and never count as answers.
    An adult demonstration without this evidence cannot raise the level.
    """
    return bool(row.get("measurement_version", 0) >= 3
                and row.get("response_owner") == "child"
                and row.get("attempt_status") == "completed"
                and (row.get("attempts_count") or 0) > 0
                and (row.get("support_context") in {"independent", "caregiver_supported"}
                     or row.get("support_context") == "caregiver_modelled" and verified_outcomes(row)))


def compatible_goal_versions(db, goal: dict) -> list[int]:
    """Pausing or changing support keeps evidence; changing the task does not."""
    def signature(value):
        return (value.get("observable_behavior"), value.get("target_outcome"),
                tuple(sorted(value.get("matching_targets", []))),
                tuple(sorted(value.get("matching_mechanics", []))))
    current = signature(goal)
    versions = {goal["version"]}
    for row in db.execute("SELECT goal_version,snapshot_json FROM practice_goal_history WHERE goal_id=?", (goal["id"],)).fetchall():
        try:
            snapshot = json.loads(row["snapshot_json"])
        except (TypeError, ValueError):
            continue
        if isinstance(snapshot, dict) and signature(snapshot) == current:
            versions.add(row["goal_version"])
    return sorted(versions)

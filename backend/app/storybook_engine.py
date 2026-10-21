"""Pure deterministic transitions: participation, assistance and breaks, never scores."""
from copy import deepcopy


def initial_state() -> dict:
    return {"scene_index": 0, "step": 0, "ready": False, "chosen_toy": "ball", "request": None, "play": None, "completed": False, "paused": False, "feedback": "", "assisted_scenes": [], "skipped_scenes": [], "hinted_scenes": [], "last_event_id": None}


def transition(story: dict, state: dict, action: str, event_id: str) -> dict:
    result = deepcopy(state)
    index = result["scene_index"]
    scene = story["scenes"][index]
    result["last_event_id"] = event_id
    if action == "restart":
        return {**initial_state(), "last_event_id": event_id}
    if action == "pause":
        result["paused"] = True
        return result
    if action == "resume":
        result["paused"] = False
        return result
    if result["paused"] or result["completed"]:
        raise ValueError("Сначала продолжите историю или начните заново")
    if action == "hint":
        result["hinted_scenes"] = sorted(set(result["hinted_scenes"] + [scene["id"]]))
        result["feedback"] = scene["hint"]
        return result
    if action in {"assist", "skip"}:
        field = "assisted_scenes" if action == "assist" else "skipped_scenes"
        result[field] = sorted(set(result[field] + [scene["id"]]))
        result["ready"] = True
        result["step"] = 2
        # Preserve narrative continuity without pretending the child made a request.
        if scene["id"] == "request": result["request"] = action
        if scene["id"] == "play": result["play"] = "rest"
        result["feedback"] = scene["assisted_reaction"]
        return result
    if action == "continue":
        if not result["ready"] and scene["kind"] != "watch":
            raise ValueError("Сначала помогите герою или выберите безопасный пропуск")
        if index == len(story["scenes"]) - 1:
            result["completed"] = True
        else:
            result.update(scene_index=index + 1, step=0, ready=False, feedback="")
        return result
    configured = next((item for item in scene["actions"] if item["key"] == action), None)
    if not configured:
        raise ValueError("Такого действия в этой сцене нет")
    if result["ready"]:
        return result
    if scene["kind"] == "choose_object":
        result["chosen_toy"] = configured["object"]
        result["ready"] = True
    elif scene["kind"] == "tap_object":
        result["ready"] = action == "find_teddy"
    elif scene["kind"] == "aac_request":
        result["request"] = action
        result["ready"] = True
    elif scene["kind"] == "give_object":
        if action == "take_teddy" and result["step"] == 0:
            result["step"] = 1
        elif action == "give_misha" and result["step"] == 1:
            result["step"] = 2
            result["ready"] = True
        else:
            raise ValueError("Сначала возьмите мишку, затем передайте его Мише")
    elif scene["kind"] == "simple_sequence":
        if action in {"play_hug", "play_roll"} and result["step"] == 0:
            result["play"] = "hug" if action == "play_hug" else "roll"
            result["step"] = 1
        elif action == "settle" and result["step"] == 1:
            result["step"] = 2
            result["ready"] = True
        else:
            raise ValueError("Сначала выберите игру, потом положите игрушку рядом")
    result["feedback"] = configured["reaction"]
    return result

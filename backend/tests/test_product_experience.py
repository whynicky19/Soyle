"""Persistence and role boundaries for the illustrated child experience."""

import base64
from pathlib import Path


def child_id(client, parent_headers):
    children = client.get("/api/children", headers=parent_headers)
    assert children.status_code == 200
    return children.json()[0]["id"]


def test_story_choices_resume_and_stay_in_child_account(client, parent_headers, student_headers):
    selected_child = child_id(client, parent_headers)
    stories = client.get(f"/api/stories/{selected_child}", headers=student_headers)
    assert stories.status_code == 200
    assert len(stories.json()) >= 4
    park = next(story for story in stories.json() if story["key"] == "park")
    assert all("answer" not in scene for scene in park["scenes"])

    restart = client.post(f"/api/stories/{selected_child}/park/restart", headers=student_headers)
    assert restart.status_code == 200
    denied = client.post(f"/api/stories/{selected_child}/park/answer", headers=parent_headers, json={"scene_index": 0, "answer_key": "help"})
    assert denied.status_code == 403

    wrong = client.post(f"/api/stories/{selected_child}/park/answer", headers=student_headers, json={"scene_index": 0, "answer_key": "sleep"})
    assert wrong.status_code == 200 and wrong.json()["correct"] is False
    assert wrong.json()["scene_index"] == 0
    right = client.post(f"/api/stories/{selected_child}/park/answer", headers=student_headers, json={"scene_index": 0, "answer_key": "help"})
    assert right.status_code == 200 and right.json()["scene_index"] == 1
    resumed = client.get(f"/api/stories/{selected_child}", headers=student_headers)
    assert next(story for story in resumed.json() if story["key"] == "park")["scene_index"] == 1
    exported = client.get(f"/api/children/{selected_child}/export", headers=parent_headers)
    assert exported.status_code == 200
    assert any(item["story_key"] == "park" and item["scene_index"] == 1 for item in exported.json()["story_progress"])


def test_private_world_photos_and_custom_aac_image(client, parent_headers, student_headers):
    selected_child = child_id(client, parent_headers)
    illustration = Path(__file__).resolve().parents[2] / "frontend/public/app-illustrations/aac-water.webp"
    image_data = "data:image/webp;base64," + base64.b64encode(illustration.read_bytes()).decode("ascii")
    payload = {"name": "Мой стакан", "category": "food", "image_data": image_data}

    denied = client.post(f"/api/world/{selected_child}", headers=student_headers, json=payload)
    assert denied.status_code == 403
    created = client.post(f"/api/world/{selected_child}", headers=parent_headers, json=payload)
    assert created.status_code == 201, created.text
    photo = created.json()
    assert photo["image_data"] == image_data
    visible = client.get(f"/api/world/{selected_child}", headers=student_headers)
    assert visible.status_code == 200
    assert any(item["id"] == photo["id"] for item in visible.json())

    card = client.post("/api/aac/cards", headers=parent_headers, json={"child_id": selected_child, "label": "Мой стакан", "speech": "Мой стакан", "category": "food", "image": image_data})
    assert card.status_code == 201, card.text
    assert card.json()["image"] == image_data
    duplicate = client.post(f"/api/world/{selected_child}", headers=parent_headers, json=payload)
    assert duplicate.status_code == 409
    exported = client.get(f"/api/children/{selected_child}/export", headers=parent_headers)
    assert exported.status_code == 200
    assert any(item["id"] == photo["id"] and item["image_data"] == image_data for item in exported.json()["world_photos"])
    delete = client.delete(f"/api/world/{selected_child}/{photo['id']}", headers=parent_headers)
    assert delete.status_code == 204
    missing = client.get(f"/api/world/{selected_child}", headers=student_headers)
    assert all(item["id"] != photo["id"] for item in missing.json())

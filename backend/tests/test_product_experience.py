"""Persistence and role boundaries for the illustrated child experience."""

import base64
from pathlib import Path


def child_id(client, parent_headers):
    children = client.get("/api/children", headers=parent_headers)
    assert children.status_code == 200
    return children.json()[0]["id"]


def test_retired_quizzes_are_hidden_without_erasing_family_history(client, parent_headers, student_headers):
    from app.database import connect, now_iso
    selected_child = child_id(client, parent_headers)
    with connect() as db:
        db.execute("""INSERT INTO child_story_progress(child_id,story_key,scene_index,completed_at,updated_at)
            VALUES(?,'park',1,NULL,?) ON CONFLICT(child_id,story_key) DO UPDATE SET scene_index=1""", (selected_child, now_iso()))
    stories = client.get(f"/api/stories/{selected_child}", headers=student_headers)
    assert stories.status_code == 200
    assert {"park", "bedtime", "meal"}.isdisjoint({story["key"] for story in stories.json()})
    denied = client.post(f"/api/stories/{selected_child}/park/answer", headers=student_headers, json={"scene_index": 1, "answer_key": "water"})
    assert denied.status_code == 404
    assert client.post(f"/api/stories/{selected_child}/park/restart", headers=student_headers).status_code == 404
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


def test_free_aac_and_household_cards(client, parent_headers, student_headers):
    selected_child = child_id(client, parent_headers)
    cards = client.get(f"/api/aac/cards/{selected_child}", headers=student_headers).json()
    by_label = {card["label"]: card for card in cards}
    assert len([card for card in cards if card["category"] == "household"]) >= 6
    payload = {"child_id": selected_child, "card_ids": [by_label[label]["id"] for label in ["Что это?", "Устал"]], "language": "ru"}
    assert client.post("/api/aac/compose", headers=student_headers, json=payload).json()["valid"] is False
    payload["mode"] = "free"
    composed = client.post("/api/aac/compose", headers=student_headers, json=payload)
    assert composed.json()["phrase"] == "Что это? Я устал"
    saved = client.post("/api/aac/history", headers=student_headers, json=payload)
    assert saved.status_code == 201, saved.text
    assert saved.json()["phrase"] == "Что это? Я устал"
    custom = client.post("/api/aac/cards", headers=parent_headers, json={"child_id": selected_child, "label": "Моя чашка", "speech": "Моя чашка", "category": "household", "image": "/p15/nouns/home/cup.svg"})
    assert custom.status_code == 201


def test_multiple_world_photos_and_parent_rename(client, parent_headers, student_headers):
    selected_child = child_id(client, parent_headers)
    created = []
    for label, filename in [("Моя вода", "aac-water.webp"), ("Мой мяч", "aac-ball.webp")]:
        raw = (Path(__file__).resolve().parents[2] / "frontend/public/app-illustrations" / filename).read_bytes()
        response = client.post(f"/api/world/{selected_child}", headers=parent_headers, json={"name": label, "category": "people", "image_data": "data:image/webp;base64," + base64.b64encode(raw).decode("ascii")})
        assert response.status_code == 201, response.text
        created.append(response.json())
    visible = client.get(f"/api/world/{selected_child}", headers=student_headers).json()
    assert {photo["id"] for photo in created} <= {photo["id"] for photo in visible}
    url = f"/api/world/{selected_child}/{created[0]['id']}"
    assert client.patch(url, headers=student_headers, json={"name": "Нет"}).status_code == 403
    assert client.patch(url, headers=parent_headers, json={"name": "   "}).status_code == 422
    renamed = client.patch(url, headers=parent_headers, json={"name": "Мой стакан воды"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Мой стакан воды"
    assert renamed.json()["image_data"] == created[0]["image_data"]

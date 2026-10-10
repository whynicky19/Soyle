import os
from pathlib import Path

TEST_DB = Path("/tmp/soyle-pytest.db")
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["SOYLE_DB_PATH"] = str(TEST_DB)
os.environ["SOYLE_SEED_DEMO_DATA"] = "true"
os.environ["SOYLE_SECRET_KEY"] = "soyle-test-secret-key-at-least-32-bytes"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as value:
        yield value
    if TEST_DB.exists():
        TEST_DB.unlink()


def login(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", headers={"X-Soyle-Auth-Mode": "bearer"}, json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def parent_headers(client):
    headers = login(client, "parent", "Parent123!")
    children = client.get("/api/children", headers=headers).json()
    for child in children:
        response = client.put(f"/api/children/{child['id']}/consent", headers=headers, json={
            "privacy_accepted": True,
            "camera_processing": True,
            "specialist_sharing": True,
            "analytics_processing": True,
        })
        assert response.status_code == 200, response.text
    return headers


@pytest.fixture(scope="session")
def specialist_headers(client):
    return login(client, "specialist", "Specialist123!")


@pytest.fixture(scope="session")
def admin_headers(client):
    return login(client, "admin", "Admin123!")


@pytest.fixture(scope="session")
def student_headers(client):
    response = client.post("/api/auth/student-login", headers={"X-Soyle-Auth-Mode": "bearer"}, json={"username": "alikhan", "pin": "1234"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

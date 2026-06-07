"""Test : la visite guidée se marque comme vue (1ʳᵉ connexion seulement)."""
from fastapi.testclient import TestClient

from app.main import app


def _auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_mark_onboarding_done_persists() -> None:
    with TestClient(app) as client:
        headers = _auth(client)
        r = client.post("/api/auth/onboarding-done", headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["onboarding_done"] is True
        # Persisté : /auth/me le reflète
        me = client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["onboarding_done"] is True

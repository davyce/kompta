"""Test : endpoints connexion Google (config publique + garde non configuré)."""
from fastapi.testclient import TestClient

from app.main import app


def test_auth_config_public_and_shape() -> None:
    with TestClient(app) as client:
        r = client.get("/api/auth/config")
        assert r.status_code == 200
        body = r.json()
        assert "google_enabled" in body
        assert "google_client_id" in body
        # En test, GOOGLE_CLIENT_ID n'est pas configuré → désactivé
        assert body["google_enabled"] is False


def test_google_login_disabled_returns_503() -> None:
    with TestClient(app) as client:
        r = client.post("/api/auth/google", json={"credential": "fake"})
        assert r.status_code == 503


def test_google_login_enabled_rejects_bad_token(monkeypatch) -> None:
    """Avec Google activé mais un jeton bidon → 401 (jamais 500)."""
    from app.core.config import get_settings
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            r = client.post("/api/auth/google", json={"credential": "not-a-real-token"})
            assert r.status_code == 401, r.text
    finally:
        get_settings.cache_clear()

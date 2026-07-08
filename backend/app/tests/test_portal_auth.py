"""
test_portal_auth.py — Auth du portail client via cookie HttpOnly.

Valide :
  - Login portail pose bien un cookie HttpOnly `kompta_portal_session`
    (le token n'est plus le seul mécanisme, cf. audit : localStorage exposé XSS).
  - Une requête ultérieure SANS header Authorization mais AVEC le cookie
    (TestClient le rejoue automatiquement) est authentifiée.
  - /portal/me restaure correctement l'identité du client.
  - /portal/auth/logout efface le cookie ; la session suivante est rejetée.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _admin_auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_portal_client(client: TestClient, admin_headers: dict[str, str]) -> tuple[int, str, str]:
    email = f"portal-{uuid4().hex[:8]}@kompta.local"
    r = client.post("/api/clients", json={"name": "Client Portail QA", "email": email}, headers=admin_headers)
    assert r.status_code == 201, r.text
    client_id = r.json()["id"]

    r = client.post("/api/portal/auth/set-password", json={"client_id": client_id}, headers=admin_headers)
    assert r.status_code == 200, r.text
    temp_password = r.json()["temporary_password"]
    return client_id, email, temp_password


def test_portal_login_sets_httponly_cookie() -> None:
    client = TestClient(app)
    admin_headers = _admin_auth(client)
    _client_id, email, temp_password = _create_portal_client(client, admin_headers)

    r = client.post("/api/portal/auth/login", json={"email": email, "password": temp_password})
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()
    assert "kompta_portal_session" in r.cookies


def test_portal_me_restores_session_via_cookie() -> None:
    client = TestClient(app)
    admin_headers = _admin_auth(client)
    _client_id, email, temp_password = _create_portal_client(client, admin_headers)

    login = client.post("/api/portal/auth/login", json={"email": email, "password": temp_password})
    assert login.status_code == 200

    # Pas de header Authorization ici : seul le cookie HttpOnly (rejoué
    # automatiquement par TestClient, comme un vrai navigateur) authentifie.
    me = client.get("/api/portal/me")
    assert me.status_code == 200, me.text
    assert me.json()["client_name"] == "Client Portail QA"


def test_portal_logout_clears_cookie_and_revokes_access() -> None:
    client = TestClient(app)
    admin_headers = _admin_auth(client)
    _client_id, email, temp_password = _create_portal_client(client, admin_headers)

    client.post("/api/portal/auth/login", json={"email": email, "password": temp_password})
    assert client.get("/api/portal/me").status_code == 200

    logout = client.post("/api/portal/auth/logout")
    assert logout.status_code == 200
    assert client.cookies.get("kompta_portal_session") is None

    assert client.get("/api/portal/me").status_code == 401


def test_portal_token_is_rejected_on_main_app_routes() -> None:
    """Cloisonnement : un token scope=client_portal ne doit jamais marcher sur /api/auth/me."""
    client = TestClient(app)
    admin_headers = _admin_auth(client)
    _client_id, email, temp_password = _create_portal_client(client, admin_headers)

    login = client.post("/api/portal/auth/login", json={"email": email, "password": temp_password})
    portal_token = login.json()["access_token"]

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {portal_token}"})
    assert r.status_code == 401

"""
test_broadcast_targeting.py — Ciblage des diffusions admin (broadcasts).

Valide :
  - Diffusion multi-entreprises (target_company_ids) apparaît bien dans
    GET /notifications d'un utilisateur de l'une des entreprises ciblées —
    corrige une régression où le filtrage SQL par égalité stricte ("all" ou
    "company_id:<id>") ne matchait jamais "company_ids:1,2,3".
  - Diffusion ciblant un utilisateur précis (target_user_ids) apparaît dans
    sa liste de notifications, mais PAS dans celle d'un autre utilisateur de
    la même entreprise.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _super(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "superadmin@kompta.io", "password": "super2026"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _register_test_company(client: TestClient) -> tuple[dict[str, str], dict]:
    unique = uuid4().hex[:8]
    email = f"broadcast-{unique}@kompta.local"
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Broadcast", "legal_name": "QA Broadcast SARL", "industry": "Services",
        "organization_type": "PME", "country": "US", "admin_full_name": "QA Broadcast",
        "admin_email": email, "admin_phone": f"05{unique[:8]}", "password": "TestBroadcast123!",
        "signatory_name": "QA Broadcast", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
    })
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return headers, r.json()["user"]


def test_multi_company_broadcast_visible_to_targeted_company() -> None:
    client = TestClient(app)
    super_headers = _super(client)
    user_headers, user = _register_test_company(client)
    company_id = user["company_id"]

    r = client.post("/api/admin/broadcast", headers=super_headers, json={
        "title": "Test multi-entreprises", "message": "Contenu test",
        "target_company_ids": [company_id],
    })
    assert r.status_code == 200, r.text

    listing = client.get("/api/notifications", headers=user_headers)
    assert listing.status_code == 200, listing.text
    titles = [n["title"] for n in listing.json()]
    assert "Test multi-entreprises" in titles


def test_user_targeted_broadcast_visible_only_to_that_user() -> None:
    client = TestClient(app)
    super_headers = _super(client)
    user_a_headers, user_a = _register_test_company(client)
    user_b_headers, _user_b = _register_test_company(client)

    r = client.post("/api/admin/broadcast", headers=super_headers, json={
        "title": "Test utilisateur unique", "message": "Contenu privé",
        "target_user_ids": [user_a["id"]],
    })
    assert r.status_code == 200, r.text
    assert r.json()["sent_to"] == 1

    a_titles = [n["title"] for n in client.get("/api/notifications", headers=user_a_headers).json()]
    assert "Test utilisateur unique" in a_titles

    b_titles = [n["title"] for n in client.get("/api/notifications", headers=user_b_headers).json()]
    assert "Test utilisateur unique" not in b_titles

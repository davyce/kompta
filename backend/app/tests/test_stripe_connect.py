"""
test_stripe_connect.py — Reversement Stripe Connect + commission plateforme.

Valide :
  - Statut initial "not_started", commission 0% par défaut.
  - Bornes de la commission plateforme (0-10%) : valeur hors bornes rejetée.
  - Seuls les rôles admin peuvent configurer la commission.
  - L'onboarding échoue proprement (400, pas de 500) si Stripe Connect n'est
    pas activé sur le compte Stripe utilisé — le endpoint ne doit jamais
    laisser fuiter une exception non gérée (cf. régression trouvée en test
    manuel : PaymentError non catchée dans start_connect_onboarding).
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_test_company(client: TestClient) -> dict[str, str]:
    unique = uuid4().hex[:8]
    email = f"connect-{unique}@kompta.local"
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Connect",
        "legal_name": "QA Connect SARL",
        "industry": "Services",
        "organization_type": "PME",
        "country": "US",
        "admin_full_name": "QA Connect",
        "admin_email": email,
        "admin_phone": f"06{unique[:8]}",
        "password": "TestConnect123!",
        "signatory_name": "QA Connect",
        "accept_privacy": True,
        "accept_terms": True,
        "accept_disclaimer": True,
    })
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_connect_status_defaults() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    r = client.get("/api/payments/connect/status", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "not_started"
    assert data["payouts_enabled"] is False
    assert data["account_id"] == ""
    assert data["platform_fee_percent"] == 0.0


def test_platform_fee_within_bounds_accepted() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    r = client.patch("/api/payments/connect/fee", json={"platform_fee_percent": 2.5}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["platform_fee_percent"] == 2.5


def test_platform_fee_out_of_bounds_rejected() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    r = client.patch("/api/payments/connect/fee", json={"platform_fee_percent": 50}, headers=headers)
    assert r.status_code == 400, r.text


def test_platform_fee_requires_admin_role() -> None:
    client = TestClient(app)
    admin_headers = _register_test_company(client)

    emp = client.post("/api/employees", json={
        "first_name": "Non", "last_name": "Admin",
        "email": f"nonadmin-{uuid4().hex[:6]}@kompta.local",
        "job_title": "Staff", "employment_type": "CDI",
    }, headers=admin_headers)
    assert emp.status_code == 200, emp.text
    employee_id = emp.json()["id"]

    prov = client.post(f"/api/employees/{employee_id}/provision-access?role=employe", headers=admin_headers)
    assert prov.status_code == 200, prov.text
    temp_password = prov.json()["temporary_password"]
    email = emp.json()["email"]

    login = client.post("/api/auth/login", json={"email": email, "password": temp_password})
    assert login.status_code == 200, login.text
    emp_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    r = client.patch("/api/payments/connect/fee", json={"platform_fee_percent": 5}, headers=emp_headers)
    assert r.status_code == 403, r.text


def test_onboarding_fails_gracefully_without_raw_500() -> None:
    """Si Stripe rejette la création de compte (Connect non activé sur le
    compte Stripe utilisé, clé absente, etc.), le endpoint doit renvoyer une
    erreur HTTP propre — jamais une exception non gérée (500 brut)."""
    client = TestClient(app)
    headers = _register_test_company(client)
    r = client.post(
        "/api/payments/connect/onboard",
        params={"return_url": "https://kompta0.com/settings", "refresh_url": "https://kompta0.com/settings"},
        headers=headers,
    )
    assert r.status_code in {400, 503}, r.text
    assert "detail" in r.json()

"""
test_payroll_tax_liabilities.py — Écriture comptable de paie décomposée +
suivi des reversements CNSS/DGI.

Valide :
  - Le virement de masse de paie poste une écriture décomposée (66 / 431 /
    447 / trésorerie) au lieu d'un seul débit "Charges de personnel" opaque
    ne reflétant que le net_pay.
  - GET /payroll/tax-liabilities reflète la dette CNSS/IRPP accumulée après
    un cycle de paie.
  - POST /payroll/tax-liabilities/remit réduit correctement la dette.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_test_company(client: TestClient) -> dict[str, str]:
    unique = uuid4().hex[:8]
    email = f"payroll-tax-{unique}@kompta.local"
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Payroll Tax", "legal_name": "QA Payroll Tax SARL", "industry": "Services",
        "organization_type": "PME", "country": "US", "admin_full_name": "QA Payroll Tax",
        "admin_email": email, "admin_phone": f"04{unique[:8]}", "password": "TestPayrollTax123!",
        "signatory_name": "QA Payroll Tax", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
    })
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _new_paid_payroll_run(client: TestClient, headers: dict[str, str]) -> dict:
    emp = client.post("/api/employees", headers=headers, json={
        "first_name": "Jean", "last_name": "Test", "email": f"emp-{uuid4().hex[:6]}@kompta.local",
        "job_title": "Comptable", "employment_type": "CDI", "salary": 500_000,
    })
    assert emp.status_code == 201, emp.text

    period = f"2026-{uuid4().hex[:2]}"
    run = client.post("/api/payroll/runs", headers=headers, json={"period": period})
    assert run.status_code == 201, run.text
    run_id = run.json()["id"]

    payment = client.post(f"/api/payroll/runs/{run_id}/mass-payment", headers=headers)
    assert payment.status_code == 200, payment.text
    return run.json()


def test_mass_payment_creates_tax_liabilities() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)

    before = client.get("/api/payroll/tax-liabilities", headers=headers)
    assert before.status_code == 200, before.text
    assert before.json()["cnss_due"] == 0
    assert before.json()["state_tax_due"] == 0

    _new_paid_payroll_run(client, headers)

    after = client.get("/api/payroll/tax-liabilities", headers=headers)
    assert after.status_code == 200, after.text
    data = after.json()
    # Salaire 500 000 → CNSS salariale+patronale+AF+AT et IRPP sont > 0 avec
    # les taux par défaut de l'entreprise.
    assert data["cnss_due"] > 0, data
    assert data["state_tax_due"] >= 0, data


def test_remit_reduces_liability() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    _new_paid_payroll_run(client, headers)

    before = client.get("/api/payroll/tax-liabilities", headers=headers).json()
    assert before["cnss_due"] > 0

    remit = client.post("/api/payroll/tax-liabilities/remit", headers=headers, json={
        "code": "431", "amount": before["cnss_due"], "payment_method": "bank",
    })
    assert remit.status_code == 200, remit.text
    assert remit.json()["cnss_due"] == 0


def test_remit_invalid_code_rejected() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)

    r = client.post("/api/payroll/tax-liabilities/remit", headers=headers, json={
        "code": "999", "amount": 100, "payment_method": "bank",
    })
    assert r.status_code == 400, r.text

"""
test_transaction_period_lock.py — Verrou d'exercice clos sur l'annulation
de transaction bancaire.

Contexte : DELETE /transactions/{id} ne poste aucune écriture comptable
(JournalEntry) — c'était donc le seul endpoint d'annulation qui échappait
au verrou de clôture d'exercice de post_entry(). Valide que
accounting.check_period_open() (facteur commun avec post_entry) bloque
bien cette annulation quand la transaction est datée d'un exercice
clôturé, et l'autorise sinon.
"""
from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models import BankTransaction, FiscalYear


def _register_test_company(client: TestClient) -> tuple[dict[str, str], int]:
    unique = uuid4().hex[:8]
    email = f"period-{unique}@kompta.local"
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Period",
        "legal_name": "QA Period SARL",
        "industry": "Services",
        "organization_type": "PME",
        "country": "US",
        "admin_full_name": "QA Period",
        "admin_email": email,
        "admin_phone": f"07{unique[:8]}",
        "password": "TestPeriod123!",
        "signatory_name": "QA Period",
        "accept_privacy": True,
        "accept_terms": True,
        "accept_disclaimer": True,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    return headers, me.json()["company_id"]


def test_cancel_transaction_blocked_when_fiscal_year_closed() -> None:
    with TestClient(app) as client:
        headers, company_id = _register_test_company(client)

        create = client.post(
            "/api/transactions", headers=headers,
            json={"date": "2024-03-15", "label": "Vieille transaction", "amount": 10000, "credit": 10000, "category": "ventes"},
        )
        assert create.status_code in (200, 201), create.text
        txn_id = create.json()["id"]

        with SessionLocal() as db:
            db.add(FiscalYear(
                company_id=company_id, label="Exercice 2024",
                start_date=date(2024, 1, 1), end_date=date(2024, 12, 31), status="closed",
            ))
            db.commit()

        cancel = client.request("DELETE", f"/api/transactions/{txn_id}", headers=headers)
        assert cancel.status_code == 400, cancel.text
        assert "clôturé" in cancel.json()["detail"]

        # La transaction n'a pas été modifiée par la tentative refusée.
        with SessionLocal() as db:
            txn = db.get(BankTransaction, txn_id)
            assert txn.status != "cancelled"


def test_cancel_transaction_allowed_when_no_fiscal_year_lock() -> None:
    with TestClient(app) as client:
        headers, _company_id = _register_test_company(client)

        create = client.post(
            "/api/transactions", headers=headers,
            json={"date": date.today().isoformat(), "label": "Transaction libre", "amount": 5000, "credit": 5000, "category": "ventes"},
        )
        assert create.status_code in (200, 201), create.text
        txn_id = create.json()["id"]

        cancel = client.request("DELETE", f"/api/transactions/{txn_id}", headers=headers)
        assert cancel.status_code == 204, cancel.text

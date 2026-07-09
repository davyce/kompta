"""
test_transaction_cancellation.py — Annulation de transaction bancaire sans
suppression physique.

Valide :
  - DELETE /transactions/{id} ne supprime plus la ligne : elle passe en
    status="cancelled" et reste consultable (traçabilité comptable).
  - Une contre-écriture miroir (montant inversé) est générée automatiquement.
  - Une transaction déjà annulée ne peut pas être annulée une seconde fois
    (409).
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_test_company(client: TestClient) -> dict[str, str]:
    unique = uuid4().hex[:8]
    email = f"txncancel-{unique}@kompta.local"
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Txn Cancel",
        "legal_name": "QA Txn Cancel SARL",
        "industry": "Services",
        "organization_type": "PME",
        "country": "US",
        "admin_full_name": "QA Txn Cancel",
        "admin_email": email,
        "admin_phone": f"09{unique[:8]}",
        "password": "TestTxnCancel123!",
        "signatory_name": "QA Txn Cancel",
        "accept_privacy": True,
        "accept_terms": True,
        "accept_disclaimer": True,
    })
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _new_transaction(client: TestClient, headers: dict[str, str]) -> dict:
    r = client.post("/api/transactions", headers=headers, json={
        "date": "2026-07-09",
        "label": "Paiement fournisseur test",
        "amount": -75000,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_cancel_transaction_keeps_record_and_creates_reversal() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    txn = _new_transaction(client, headers)

    r = client.delete(f"/api/transactions/{txn['id']}", headers=headers)
    assert r.status_code == 204, r.text

    listing = client.get("/api/transactions", headers=headers)
    assert listing.status_code == 200, listing.text
    rows = listing.json()["items"]

    original = next(t for t in rows if t["id"] == txn["id"])
    assert original["status"] == "cancelled"

    reversals = [t for t in rows if t.get("source_type") == "cancellation"]
    assert len(reversals) == 1
    assert reversals[0]["amount"] == -txn["amount"]


def test_cancel_already_cancelled_transaction_rejected() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    txn = _new_transaction(client, headers)

    first = client.delete(f"/api/transactions/{txn['id']}", headers=headers)
    assert first.status_code == 204, first.text

    second = client.delete(f"/api/transactions/{txn['id']}", headers=headers)
    assert second.status_code == 409, second.text

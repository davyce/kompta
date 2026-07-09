"""
test_invoice_cancellation.py — Annulation de facture sans suppression physique.

Valide :
  - DELETE /invoices/{id} ne supprime plus la pièce : elle passe en
    status="cancelled" et reste consultable (traçabilité comptable).
  - Un avoir (credit_note) miroir est généré automatiquement, montants
    négatifs égaux à la facture d'origine.
  - Une facture déjà annulée ne peut pas être annulée une seconde fois (409).
  - Le motif reste obligatoire (422 si absent/trop court).
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_test_company(client: TestClient) -> dict[str, str]:
    unique = uuid4().hex[:8]
    email = f"cancel-{unique}@kompta.local"
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Cancel",
        "legal_name": "QA Cancel SARL",
        "industry": "Services",
        "organization_type": "PME",
        "country": "US",
        "admin_full_name": "QA Cancel",
        "admin_email": email,
        "admin_phone": f"07{unique[:8]}",
        "password": "TestCancel123!",
        "signatory_name": "QA Cancel",
        "accept_privacy": True,
        "accept_terms": True,
        "accept_disclaimer": True,
    })
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _new_invoice(client: TestClient, headers: dict[str, str]) -> dict:
    r = client.post("/api/invoices", headers=headers, json={
        "customer_name": "Client Test",
        "status": "sent",
        "lines": [{"description": "Prestation", "quantity": 2, "unit_price": 50000, "tax_rate": 18}],
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_cancel_invoice_keeps_record_and_creates_credit_note() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    invoice = _new_invoice(client, headers)

    r = client.request(
        "DELETE", f"/api/invoices/{invoice['id']}", headers=headers,
        json={"reason": "Erreur de saisie client"},
    )
    assert r.status_code == 204, r.text

    # La facture d'origine existe toujours, avec un statut "cancelled".
    listing = client.get("/api/invoices", headers=headers)
    assert listing.status_code == 200, listing.text
    rows = listing.json()
    original = next(i for i in rows if i["id"] == invoice["id"])
    assert original["status"] == "cancelled"

    # Un avoir miroir a été créé, montants négatifs égaux à l'original.
    credit_notes = [i for i in rows if i["status"] == "credit_note"]
    assert len(credit_notes) == 1
    credit = credit_notes[0]
    assert credit["total_amount"] == -invoice["total_amount"]


def test_cancel_already_cancelled_invoice_rejected() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    invoice = _new_invoice(client, headers)

    first = client.request(
        "DELETE", f"/api/invoices/{invoice['id']}", headers=headers,
        json={"reason": "Erreur de saisie client"},
    )
    assert first.status_code == 204, first.text

    second = client.request(
        "DELETE", f"/api/invoices/{invoice['id']}", headers=headers,
        json={"reason": "Nouvelle tentative"},
    )
    assert second.status_code == 409, second.text


def test_cancel_invoice_requires_reason() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    invoice = _new_invoice(client, headers)

    r = client.request(
        "DELETE", f"/api/invoices/{invoice['id']}", headers=headers,
        json={"reason": "x"},
    )
    assert r.status_code == 422, r.text

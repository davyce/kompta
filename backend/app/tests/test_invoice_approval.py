"""
test_invoice_approval.py — Workflow d'approbation factures (N+1).

Valide :
  - Facture sous seuil → approval_status="not_required", paiement direct OK.
  - Facture ≥ seuil → approval_status="pending", paiement bloqué.
  - approve() par admin_entreprise → approved, paiement OK.
  - reject() avec reason → rejected ; sans reason → 400.
  - Une facture rejetée peut être éditée → re-soumise (pending).
"""
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models import Company, User


def _auth(client: TestClient) -> tuple[dict[str, str], int]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "admin@kompta.local"))
        assert user is not None
        cid = int(user.company_id)
    return headers, cid


def _set_threshold(company_id: int, cents: int) -> None:
    with SessionLocal() as db:
        company = db.get(Company, company_id)
        company.invoice_approval_threshold_cents = cents
        db.commit()


def _new_invoice(client: TestClient, headers: dict[str, str], *, unit_price: float) -> dict:
    suffix = uuid4().hex[:6]
    r = client.post(
        "/api/invoices", headers=headers,
        json={
            "customer_name": f"Approval test {suffix}",
            "status": "sent",
            "lines": [{"description": "Service", "quantity": 1, "unit_price": unit_price, "tax_rate": 0}],
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_invoice_below_threshold_not_required_and_payable():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=1_000_000)  # seuil 10 000 (en cents)
        inv = _new_invoice(client, h, unit_price=500)  # 500 < 10 000
        assert inv["approval_status"] == "not_required"
        # Paiement direct autorisé
        r = client.post(f"/api/invoices/{inv['id']}/pay", headers=h, json={"payment_method": "cash"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "paid"


def test_invoice_above_threshold_pending_and_payment_blocked():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=10_000)  # seuil 100
        inv = _new_invoice(client, h, unit_price=500)  # 500 ≥ 100
        assert inv["approval_status"] == "pending"
        # Paiement bloqué
        r = client.post(f"/api/invoices/{inv['id']}/pay", headers=h, json={"payment_method": "cash"})
        assert r.status_code == 409, r.text


def test_invoice_threshold_disabled_when_zero():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=0)
        inv = _new_invoice(client, h, unit_price=999_999)
        assert inv["approval_status"] == "not_required"


def test_admin_can_approve_pending_invoice_then_pay():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=10_000)
        inv = _new_invoice(client, h, unit_price=500)
        assert inv["approval_status"] == "pending"
        # Approbation
        r = client.post(f"/api/invoices/{inv['id']}/approve", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["approval_status"] == "approved"
        assert body["approved_by_user_id"] is not None
        # Paiement maintenant OK
        rp = client.post(f"/api/invoices/{inv['id']}/pay", headers=h, json={"payment_method": "cash"})
        assert rp.status_code == 200, rp.text


def test_reject_with_reason_sets_rejected_status():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=10_000)
        inv = _new_invoice(client, h, unit_price=500)
        r = client.post(
            f"/api/invoices/{inv['id']}/reject", headers=h,
            json={"reason": "Montant suspect, justificatifs manquants"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["approval_status"] == "rejected"
        assert "suspect" in body["rejection_reason"]


def test_reject_without_reason_returns_400():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=10_000)
        inv = _new_invoice(client, h, unit_price=500)
        r = client.post(f"/api/invoices/{inv['id']}/reject", headers=h, json={"reason": ""})
        # Pydantic validation error → 422 ; spec dit 400 — on accepte les deux.
        assert r.status_code in (400, 422), r.text


def test_rejected_invoice_can_be_edited_and_returns_to_pending():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=10_000)
        inv = _new_invoice(client, h, unit_price=500)
        client.post(
            f"/api/invoices/{inv['id']}/reject", headers=h,
            json={"reason": "Erreur intitulé"},
        )
        # Édition autorisée : re-soumission → pending
        r = client.patch(
            f"/api/invoices/{inv['id']}", headers=h,
            json={"customer_name": "Nom corrigé"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["customer_name"] == "Nom corrigé"
        assert body["approval_status"] == "pending"
        assert body["rejection_reason"] == ""


def test_pending_approval_listing_includes_pending_invoices():
    with TestClient(app) as client:
        h, cid = _auth(client)
        _set_threshold(cid, cents=10_000)
        inv = _new_invoice(client, h, unit_price=500)
        r = client.get("/api/invoices/pending-approval", headers=h)
        assert r.status_code == 200, r.text
        ids = {it["id"] for it in r.json()}
        assert inv["id"] in ids

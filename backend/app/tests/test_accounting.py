"""
test_accounting.py — Moteur comptable partie double (SYSCOHADA-lite).
Valide : équilibre Σdébit=Σcrédit garanti, écriture auto à la vente, balance,
rejet d'écriture déséquilibrée, et exactitude des montants en centimes.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _auth(client):
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_money_helpers_are_exact():
    from app.services.accounting import to_cents, from_cents
    # 0.1 + 0.2 piège classique du Float — exact en centimes
    assert to_cents(0.1) + to_cents(0.2) == to_cents(0.3) == 30
    assert from_cents(30) == 0.30
    assert to_cents(1234.56) == 123456


def test_chart_of_accounts_seeded():
    with TestClient(app) as client:
        h = _auth(client)
        accounts = client.get("/api/accounting/accounts", headers=h).json()
        codes = {a["code"] for a in accounts}
        assert {"411", "70", "443", "571"}.issubset(codes)  # clients, ventes, TVA, caisse


def test_pos_sale_posts_balanced_entry():
    with TestClient(app) as client:
        h = _auth(client)
        suffix = uuid4().hex[:8]
        prod = client.post(
            "/api/products", headers=h,
            json={"name": f"Compta test {suffix}", "sku": f"CT-{suffix}", "category": "T", "price": 250, "stock_quantity": 10},
        ).json()
        client.post("/api/pos/sales", headers=h, json={"items": [{"product_id": prod["id"], "quantity": 2}], "payment_method": "cash"})
        journal = client.get("/api/accounting/journal?limit=5", headers=h).json()
        sale_entries = [e for e in journal if e["source_type"] == "sale"]
        assert sale_entries
        entry = sale_entries[0]
        # une écriture est toujours équilibrée
        assert sum(l["debit"] for l in entry["lines"]) == sum(l["credit"] for l in entry["lines"])


def test_trial_balance_is_always_balanced():
    with TestClient(app) as client:
        h = _auth(client)
        balance = client.get("/api/accounting/balance", headers=h).json()
        assert balance["balanced"] is True
        assert balance["total_debit"] == balance["total_credit"]


def test_manual_unbalanced_entry_rejected():
    with TestClient(app) as client:
        h = _auth(client)
        r = client.post(
            "/api/accounting/entries", headers=h,
            json={"label": "Test déséquilibré", "lines": [
                {"code": "571", "debit": 100, "credit": 0},
                {"code": "70", "debit": 0, "credit": 90},  # ne s'équilibre pas
            ]},
        )
        assert r.status_code == 400


def test_manual_balanced_entry_accepted():
    with TestClient(app) as client:
        h = _auth(client)
        r = client.post(
            "/api/accounting/entries", headers=h,
            json={"label": "Apport caisse", "lines": [
                {"code": "571", "debit": 5000, "credit": 0},
                {"code": "101", "debit": 0, "credit": 5000},
            ]},
        )
        assert r.status_code == 201
        assert r.json()["reference"].startswith("EC-")


def test_invoice_payment_posts_entry():
    with TestClient(app) as client:
        h = _auth(client)
        inv = client.post(
            "/api/invoices", headers=h,
            json={"customer_name": "Client compta", "status": "sent",
                  "lines": [{"description": "Service", "quantity": 1, "unit_price": 1000, "tax_rate": 0}]},
        ).json()
        client.post(f"/api/invoices/{inv['id']}/pay", headers=h, json={"payment_method": "mobile_money"})
        journal = client.get("/api/accounting/journal?limit=10", headers=h).json()
        pay_entries = [e for e in journal if e["source_type"] == "invoice_payment" and e["source_id"] == inv["id"]]
        assert pay_entries
        # Dr trésorerie (531 mobile money) / Cr clients (411)
        codes = {l["account_code"] for l in pay_entries[0]["lines"]}
        assert "411" in codes

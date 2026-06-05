"""
test_accounting_reports.py — Rapports comptables exportables.

Valide :
  - Grand Livre : lignes avec balance cumulée correcte par compte.
  - Balance : totaux débit = totaux crédit (équilibre).
  - Bilan : Total ACTIF = Total PASSIF (équilibre comptable).
  - Compte de résultat : renvoie un champ resultat (= produits − charges).

Tous les tests exercent les exports JSON ; un test rapide couvre CSV + PDF.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_sale_and_invoice(client: TestClient, headers: dict[str, str]) -> None:
    """Génère un peu d'activité comptable : 1 vente + 1 facture payée."""
    suffix = uuid4().hex[:8]
    prod = client.post(
        "/api/products", headers=headers,
        json={"name": f"Reports test {suffix}", "sku": f"RT-{suffix}", "category": "T",
              "price": 300, "stock_quantity": 5},
    ).json()
    assert "id" in prod
    r = client.post(
        "/api/pos/sales", headers=headers,
        json={"items": [{"product_id": prod["id"], "quantity": 1}], "payment_method": "cash"},
    )
    assert r.status_code in (200, 201), r.text

    inv = client.post(
        "/api/invoices", headers=headers,
        json={"customer_name": "Reports client", "status": "sent",
              "lines": [{"description": "Service report", "quantity": 1, "unit_price": 500, "tax_rate": 0}]},
    ).json()
    pay = client.post(f"/api/invoices/{inv['id']}/pay", headers=headers, json={"payment_method": "cash"})
    assert pay.status_code in (200, 201), pay.text


def test_general_ledger_returns_lines_with_cumulative_balance():
    with TestClient(app) as client:
        h = _auth(client)
        _create_sale_and_invoice(client, h)
        r = client.get("/api/accounting/reports/general-ledger", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "lines" in body and len(body["lines"]) > 0

        # Vérifie que la balance cumulée est correcte par compte
        running: dict[str, float] = {}
        for line in body["lines"]:
            code = line["account_code"]
            running[code] = round(running.get(code, 0) + (line["debit"] - line["credit"]), 2)
            assert round(line["balance_cumulee"], 2) == running[code], (
                f"Balance cumulée incorrecte pour {code}: attendu {running[code]} obtenu {line['balance_cumulee']}"
            )


def test_general_ledger_account_filter():
    with TestClient(app) as client:
        h = _auth(client)
        _create_sale_and_invoice(client, h)
        r = client.get("/api/accounting/reports/general-ledger?account=411", headers=h)
        assert r.status_code == 200
        body = r.json()
        for line in body["lines"]:
            assert line["account_code"] == "411"


def test_trial_balance_is_balanced():
    with TestClient(app) as client:
        h = _auth(client)
        _create_sale_and_invoice(client, h)
        r = client.get("/api/accounting/reports/trial-balance", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total_debit"] == body["total_credit"], (
            f"Balance déséquilibrée : débit {body['total_debit']} ≠ crédit {body['total_credit']}"
        )
        assert body["balanced"] is True


def test_balance_sheet_actif_equals_passif():
    with TestClient(app) as client:
        h = _auth(client)
        _create_sale_and_invoice(client, h)
        r = client.get("/api/accounting/reports/balance-sheet", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        total_actif = body["actif"]["total"]
        total_passif = body["passif"]["total"]
        assert round(total_actif, 2) == round(total_passif, 2), (
            f"Bilan déséquilibré : ACTIF {total_actif} ≠ PASSIF {total_passif}"
        )
        assert body["balanced"] is True


def test_income_statement_returns_resultat():
    with TestClient(app) as client:
        h = _auth(client)
        _create_sale_and_invoice(client, h)
        r = client.get("/api/accounting/reports/income-statement", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "resultat" in body
        assert "total_produits" in body
        assert "total_charges" in body
        # resultat == produits − charges (à la précision décimale près)
        assert round(body["resultat"], 2) == round(body["total_produits"] - body["total_charges"], 2)


def test_reports_csv_and_pdf_exports():
    with TestClient(app) as client:
        h = _auth(client)
        _create_sale_and_invoice(client, h)
        for endpoint in (
            "/api/accounting/reports/trial-balance",
            "/api/accounting/reports/general-ledger",
        ):
            r_csv = client.get(f"{endpoint}?format=csv", headers=h)
            assert r_csv.status_code == 200, r_csv.text
            assert "text/csv" in r_csv.headers.get("content-type", "")
            r_pdf = client.get(f"{endpoint}?format=pdf", headers=h)
            assert r_pdf.status_code == 200, r_pdf.text
            assert r_pdf.headers.get("content-type", "").startswith("application/pdf")
            assert r_pdf.content[:4] == b"%PDF"

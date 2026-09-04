"""
test_platform_sales_currency.py — Agrégation multi-devises du "Ventes
totales" plateforme (Console super-admin).

Contexte : /admin/overview sommait Sale.total_amount avec un simple SUM()
SQL, sans tenir compte de la devise de saisie (XAF/EUR/USD selon la
préférence du caissier au moment de la vente). Une vente à 8,99 $US était
donc comptée comme "8,99" au lieu de son équivalent ~5 391 XAF (8.99 * 600),
faisant paraître le total plateforme largement sous-évalué. Valide que le
total est maintenant converti en XAF par ligne (cf. currency.sum_amounts_xaf).
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def super_admin_headers(client: TestClient) -> dict[str, str]:
    return login_headers(client, "superadmin@kompta.io", "super2026")


def _register_test_company(client: TestClient) -> dict[str, str]:
    unique = uuid4().hex[:8]
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Currency",
        "legal_name": "QA Currency SARL",
        "industry": "Services",
        "organization_type": "PME",
        "country": "US",
        "admin_full_name": "QA Currency",
        "admin_email": f"currency-{unique}@kompta.local",
        "admin_phone": f"07{unique[:8]}",
        "password": "TestCurrency123!",
        "signatory_name": "QA Currency",
        "accept_privacy": True,
        "accept_terms": True,
        "accept_disclaimer": True,
    })
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_admin_overview_sales_total_converts_usd_sale_to_xaf() -> None:
    with TestClient(app) as client:
        headers = _register_test_company(client)

        # Bascule la préférence de devise du caissier sur USD.
        pref = client.patch("/api/me/preferences", headers=headers, json={"currency": "USD"})
        assert pref.status_code == 200, pref.text
        assert pref.json()["currency"] == "USD"

        suffix = uuid4().hex[:8]
        prod = client.post(
            "/api/products", headers=headers,
            json={"name": f"Devise test {suffix}", "sku": f"CUR-{suffix}", "category": "T", "price": 10, "stock_quantity": 5},
        ).json()

        before = client.get("/api/admin/overview", headers=super_admin_headers(client))
        assert before.status_code == 200, before.text
        sales_before = before.json()["sales_total"]

        sale = client.post(
            "/api/pos/sales", headers=headers,
            json={"items": [{"product_id": prod["id"], "quantity": 1}], "payment_method": "cash"},
        )
        assert sale.status_code == 201, sale.text
        assert sale.json()["total_amount"] == 10  # valeur faciale en USD

        after = client.get("/api/admin/overview", headers=super_admin_headers(client))
        assert after.status_code == 200, after.text
        sales_after = after.json()["sales_total"]

        delta = sales_after - sales_before
        # 10 $US converti au taux par défaut (600 XAF/$) = 6000 XAF — très
        # supérieur à 10, ce qui prouve que la conversion a bien eu lieu
        # (un bug de mélange de devises aurait ajouté exactement 10).
        assert delta > 1000, f"delta trop faible ({delta}) — la vente USD n'a pas été convertie en XAF"
        assert abs(delta - 6000) < 1, f"delta inattendu ({delta}), taux par défaut USD attendu ~600"

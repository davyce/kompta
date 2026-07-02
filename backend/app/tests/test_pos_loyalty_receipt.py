from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_pos_client_discount_loyalty_and_receipt_pdf():
    with TestClient(app) as client:
        login = client.post(
            "/api/auth/login",
            json={"email": "admin@kompta.local", "password": "kompta123"},
        )
        assert login.status_code == 200, login.text
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        settings = client.patch(
            "/api/company/profile",
            headers=headers,
            json={"loyalty_enabled": True, "loyalty_points_per_1000": 2},
        )
        assert settings.status_code == 200, settings.text

        customer = client.post(
            "/api/clients",
            headers=headers,
            json={"name": f"Client fidélité {uuid4().hex[:6]}", "status": "active"},
        )
        assert customer.status_code == 201, customer.text
        customer_id = customer.json()["id"]

        promo = client.post(
            f"/api/clients/{customer_id}/discounts",
            headers=headers,
            json={
                "label": "Promotion caisse",
                "discount_type": "percent",
                "discount_value": 10,
                "min_order_amount": 0,
                "applies_to": "pos",
                "active": True,
            },
        )
        assert promo.status_code == 201, promo.text

        suffix = uuid4().hex[:8]
        product = client.post(
            "/api/products",
            headers=headers,
            json={
                "name": f"Produit fidélité {suffix}",
                "sku": f"LOY-{suffix}",
                "category": "Test",
                "price": 10_000,
                "stock_quantity": 3,
            },
        )
        assert product.status_code == 201, product.text

        sale = client.post(
            "/api/pos/sales",
            headers=headers,
            json={
                "client_id": customer_id,
                "payment_method": "cash",
                "items": [{"product_id": product.json()["id"], "quantity": 1}],
                "tva_enabled": False,
            },
        )
        assert sale.status_code == 201, sale.text
        body = sale.json()
        assert body["client_id"] == customer_id
        assert body["discount_percent"] == 10
        assert body["total_amount"] == 9_000
        assert body["loyalty_points_earned"] == 18

        refreshed = client.get("/api/clients?per_page=0", headers=headers)
        selected = next(row for row in refreshed.json() if row["id"] == customer_id)
        assert selected["loyalty_points"] == 18

        receipt = client.get(f"/api/pos/sales/{body['id']}/receipt", headers=headers)
        assert receipt.status_code == 200
        assert receipt.headers["content-type"].startswith("application/pdf")
        assert receipt.content[:4] == b"%PDF"

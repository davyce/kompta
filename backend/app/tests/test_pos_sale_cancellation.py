from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _login_and_headers(client: TestClient) -> dict:
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@kompta.local", "password": "kompta123"},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _create_product(client: TestClient, headers: dict, stock: int = 5) -> dict:
    suffix = uuid4().hex[:8]
    product = client.post(
        "/api/products",
        headers=headers,
        json={
            "name": f"Produit annulation {suffix}",
            "sku": f"CAN-{suffix}",
            "category": "Test",
            "price": 5_000,
            "stock_quantity": stock,
        },
    )
    assert product.status_code == 201, product.text
    return product.json()


def test_cancel_sale_restores_stock_and_marks_cancelled():
    with TestClient(app) as client:
        headers = _login_and_headers(client)
        product = _create_product(client, headers, stock=5)

        sale = client.post(
            "/api/pos/sales",
            headers=headers,
            json={
                "payment_method": "cash",
                "items": [{"product_id": product["id"], "quantity": 2}],
                "tva_enabled": False,
            },
        )
        assert sale.status_code == 201, sale.text
        sale_id = sale.json()["id"]

        def stock_of(product_id: int) -> int:
            listed = client.get("/api/products", headers=headers)
            assert listed.status_code == 200, listed.text
            row = next(p for p in listed.json() if p["id"] == product_id)
            return row["stock_quantity"]

        assert stock_of(product["id"]) == 3  # 5 - 2

        # Motif trop court refusé par Pydantic (min_length=3).
        bad = client.post(f"/api/pos/sales/{sale_id}/cancel", headers=headers, json={"reason": "x"})
        assert bad.status_code == 422

        cancel = client.post(
            f"/api/pos/sales/{sale_id}/cancel",
            headers=headers,
            json={"reason": "Erreur de saisie caissier"},
        )
        assert cancel.status_code == 200, cancel.text
        body = cancel.json()
        assert body["status"] == "cancelled"
        assert body["cancel_reason"] == "Erreur de saisie caissier"
        assert body["cancelled_at"] is not None

        # Stock réintégré.
        assert stock_of(product["id"]) == 5

        # Vente marquée annulée dans l'historique.
        listed = client.get("/api/pos/sales?limit=50", headers=headers)
        row = next(r for r in listed.json() if r["id"] == sale_id)
        assert row["status"] == "cancelled"
        assert row["cancel_reason"] == "Erreur de saisie caissier"

        # Deuxième annulation refusée (déjà annulée).
        again = client.post(
            f"/api/pos/sales/{sale_id}/cancel",
            headers=headers,
            json={"reason": "Deuxième tentative"},
        )
        assert again.status_code == 409


def test_cancel_sale_requires_admin_or_manager_role():
    with TestClient(app) as client:
        admin_headers = _login_and_headers(client)
        product = _create_product(client, admin_headers, stock=3)

        sale = client.post(
            "/api/pos/sales",
            headers=admin_headers,
            json={
                "payment_method": "cash",
                "items": [{"product_id": product["id"], "quantity": 1}],
                "tva_enabled": False,
            },
        )
        assert sale.status_code == 201, sale.text
        sale_id = sale.json()["id"]

        suffix = uuid4().hex[:8]
        employee_email = f"caissier.{suffix}@kompta.local"
        created = client.post(
            "/api/employees",
            headers=admin_headers,
            json={
                "first_name": "Caissier",
                "last_name": suffix,
                "email": employee_email,
                "job_title": "Caissier",
                "access_role": "employe",
            },
        )
        assert created.status_code == 201, created.text
        provision = client.post(
            f"/api/employees/{created.json()['id']}/provision-access?role=employe",
            headers=admin_headers,
        )
        assert provision.status_code == 200, provision.text
        temp_password = provision.json()["temporary_password"]

        cashier_login = client.post(
            "/api/auth/login",
            json={"email": employee_email, "password": temp_password},
        )
        assert cashier_login.status_code == 200, cashier_login.text
        cashier_headers = {"Authorization": f"Bearer {cashier_login.json()['access_token']}"}

        forbidden = client.post(
            f"/api/pos/sales/{sale_id}/cancel",
            headers=cashier_headers,
            json={"reason": "Je tente quand même"},
        )
        assert forbidden.status_code == 403

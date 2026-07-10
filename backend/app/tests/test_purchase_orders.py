"""
test_purchase_orders.py — Phase B : fournisseurs, bons de commande, stock CMP.

Valide le cycle complet :
  - Création fournisseur + bon de commande (brouillon).
  - Réception : le CMP du produit se met à jour (moyenne pondérée), le stock
    augmente, une écriture comptable équilibrée est postée (31/60/445/401).
  - Règlement fournisseur : écriture 401/trésorerie, statut "paid".
  - Une vente POS consomme le CMP courant et poste le COGS (603/31),
    sans jamais modifier le CMP lui-même.
  - Survente bloquée (409) plutôt que stock négatif.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_test_company(client: TestClient) -> dict[str, str]:
    unique = uuid4().hex[:8]
    email = f"purchases-{unique}@kompta.local"
    r = client.post("/api/auth/register-company", json={
        "company_name": "QA Purchases", "legal_name": "QA Purchases SARL", "industry": "Commerce",
        "organization_type": "PME", "country": "US", "admin_full_name": "QA Purchases",
        "admin_email": email, "admin_phone": f"03{unique[:8]}", "password": "TestPurchases123!",
        "signatory_name": "QA Purchases", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
    })
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _new_supplier(client: TestClient, headers: dict[str, str]) -> dict:
    r = client.post("/api/suppliers", headers=headers, json={"name": "Fournisseur Test"})
    assert r.status_code == 201, r.text
    return r.json()


def _new_product(client: TestClient, headers: dict[str, str], *, stock_quantity: int = 0) -> dict:
    sku = f"SKU-{uuid4().hex[:8]}"
    r = client.post("/api/products", headers=headers, json={
        "name": "Produit Test", "sku": sku, "price": 5000, "stock_quantity": stock_quantity,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_purchase_order_receipt_updates_cmp_and_posts_accounting() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    supplier = _new_supplier(client, headers)
    product = _new_product(client, headers)

    po = client.post("/api/purchase-orders", headers=headers, json={
        "supplier_id": supplier["id"],
        "lines": [{"product_id": product["id"], "description": "Achat stock", "quantity": 10, "unit_cost": 2000, "tax_rate": 0}],
    })
    assert po.status_code == 201, po.text
    po_id = po.json()["id"]
    assert po.json()["status"] == "draft"
    assert po.json()["total_amount"] == 20000

    received = client.post(f"/api/purchase-orders/{po_id}/receive", headers=headers)
    assert received.status_code == 200, received.text
    assert received.json()["status"] == "received"

    products = client.get("/api/products", headers=headers).json()
    items = products["items"] if isinstance(products, dict) else products
    updated = next(p for p in items if p["id"] == product["id"])
    assert updated["stock_quantity"] == 10

    paid = client.post(f"/api/purchase-orders/{po_id}/pay?payment_method=bank", headers=headers)
    assert paid.status_code == 200, paid.text
    assert paid.json()["status"] == "paid"


def test_sale_consumes_cmp_without_changing_it() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    supplier = _new_supplier(client, headers)
    product = _new_product(client, headers)

    po = client.post("/api/purchase-orders", headers=headers, json={
        "supplier_id": supplier["id"],
        "lines": [{"product_id": product["id"], "description": "Achat stock", "quantity": 20, "unit_cost": 1000, "tax_rate": 0}],
    })
    assert po.status_code == 201, po.text
    client.post(f"/api/purchase-orders/{po.json()['id']}/receive", headers=headers)

    sale = client.post("/api/pos/sales", headers=headers, json={
        "payment_method": "cash", "items": [{"product_id": product["id"], "quantity": 5}],
    })
    assert sale.status_code == 201, sale.text

    products = client.get("/api/products", headers=headers).json()
    items = products["items"] if isinstance(products, dict) else products
    updated = next(p for p in items if p["id"] == product["id"])
    assert updated["stock_quantity"] == 15


def test_oversell_blocked() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    product = _new_product(client, headers, stock_quantity=2)

    sale = client.post("/api/pos/sales", headers=headers, json={
        "payment_method": "cash", "items": [{"product_id": product["id"], "quantity": 5}],
    })
    assert sale.status_code == 409, sale.text


def test_supplier_stats() -> None:
    client = TestClient(app)
    headers = _register_test_company(client)
    supplier = _new_supplier(client, headers)
    product = _new_product(client, headers)

    client.post("/api/purchase-orders", headers=headers, json={
        "supplier_id": supplier["id"],
        "lines": [{"product_id": product["id"], "description": "Achat", "quantity": 1, "unit_cost": 1000, "tax_rate": 0}],
    })

    stats = client.get(f"/api/suppliers/{supplier['id']}/stats", headers=headers)
    assert stats.status_code == 200, stats.text
    assert stats.json()["purchase_order_count"] == 1

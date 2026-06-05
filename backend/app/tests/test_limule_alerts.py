"""Test : alertes Limule proactives (mission 2)."""
from __future__ import annotations

from datetime import date, timedelta
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models import Invoice, Product, User


def _login(client: TestClient, email: str = "admin@kompta.local", password: str = "kompta123") -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_limule_alerts_overdue_and_low_stock() -> None:
    with TestClient(app) as client:
        headers = _login(client)

        db = SessionLocal()
        try:
            admin = db.query(User).filter(User.email == "admin@kompta.local").first()
            assert admin is not None

            # Facture en retard
            inv = Invoice(
                number=f"INV-TEST-{date.today().isoformat()}",
                customer_name="Client Test",
                status="sent",
                subtotal=100000, tax_amount=18000, total_amount=118000,
                subtotal_cents=10000000, tax_amount_cents=1800000, total_amount_cents=11800000,
                currency="XAF",
                due_date=date.today() - timedelta(days=10),
                company_id=admin.company_id,
            )
            db.add(inv)

            # Produit sous le seuil
            from uuid import uuid4
            prod = Product(
                name="Produit test stock bas",
                sku=f"SKU-LOW-{uuid4().hex[:6]}",
                price=1000, price_cents=100000,
                stock_quantity=1, reorder_level=10,
                company_id=admin.company_id,
            )
            db.add(prod)
            db.commit()
        finally:
            db.close()

        response = client.get("/api/limule/alerts", headers=headers)
        assert response.status_code == 200, response.text
        alerts = response.json()
        assert isinstance(alerts, list)

        types = [a["type"] for a in alerts]
        assert "overdue_invoice" in types, f"alertes: {alerts}"
        assert "low_stock" in types, f"alertes: {alerts}"

        # Vérifier la structure des alertes
        for alert in alerts:
            assert "severity" in alert
            assert "type" in alert
            assert "message" in alert
            assert "action_url" in alert
            assert alert["severity"] in ("info", "warning", "critical")

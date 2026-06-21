from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _super_headers(client: TestClient) -> dict[str, str]:
    return _login_headers(client, "superadmin@kompta.io", "super2026")


def _register_company(client: TestClient) -> dict[str, str]:
    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/auth/register-company",
        json={
            "company_name": f"Priorites {suffix}",
            "legal_name": f"Priorites SARL {suffix}",
            "industry": "Services",
            "organization_type": "PME",
            "country": "Congo",
            "admin_full_name": "Admin Priorites",
            "admin_email": f"prio.{suffix}@kompta.local",
            "password": "kompta123",
            "signatory_name": "Test Signataire", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_admin_preflight_and_feature_flags_by_key() -> None:
    with TestClient(app) as client:
        headers = _super_headers(client)
        preflight = client.get("/api/admin/system/preflight", headers=headers)
        assert preflight.status_code == 200, preflight.text
        body = preflight.json()
        assert body["score"] >= 0
        assert any(section["id"] == "migrations" for section in body["sections"])
        assert any(item["id"] == "schema_tasks" for section in body["sections"] for item in section["items"])

        key = f"priority_readiness_{uuid4().hex[:6]}"
        created = client.post(
            "/api/admin/system/flags",
            headers=headers,
            json={"key": key, "description": "test", "value": "on", "enabled": True},
        )
        assert created.status_code == 200, created.text
        patched = client.patch(f"/api/admin/system/flags/{key}", headers=headers, json={"enabled": False})
        assert patched.status_code == 200, patched.text
        assert patched.json()["enabled"] is False
        deleted = client.delete(f"/api/admin/system/flags/{key}", headers=headers)
        assert deleted.status_code == 200, deleted.text


def test_erp_ai_notifications_and_group_portfolio_are_real_data_driven() -> None:
    today = date.today()
    with TestClient(app) as client:
        headers = _register_company(client)

        invoice = client.post(
            "/api/invoices",
            headers=headers,
            json={
                "customer_name": "Client TVA",
                "status": "sent",
                "due_date": (today - timedelta(days=1)).isoformat(),
                "lines": [{"description": "Service taxable", "quantity": 1, "unit_price": 100, "tax_rate": 18}],
            },
        )
        assert invoice.status_code == 201, invoice.text

        product = client.post(
            "/api/products",
            headers=headers,
            json={
                "name": "Produit seuil",
                "sku": f"LOW-{uuid4().hex[:6]}",
                "category": "Tests",
                "price": 10,
                "stock_quantity": 1,
                "reorder_level": 5,
            },
        )
        assert product.status_code == 201, product.text

        fiscal = client.post(
            "/api/fiscal/deadlines",
            headers=headers,
            json={
                "title": "TVA test",
                "description": "Declaration TVA test",
                "due_date": today.isoformat(),
                "tax_type": "TVA",
                "status": "upcoming",
                "recurrence": "once",
                "reminder_days": 7,
            },
        )
        assert fiscal.status_code == 201, fiscal.text

        task = client.post(
            "/api/tasks",
            headers=headers,
            json={
                "title": "Cloturer TVA",
                "status": "todo",
                "priority": "high",
                "due_date": today.isoformat(),
                "source": "audit",
            },
        )
        assert task.status_code == 201, task.text

        vat = client.get(f"/api/fiscal/vat-summary?period={today:%Y-%m}", headers=headers)
        assert vat.status_code == 200, vat.text
        assert vat.json()["taxable_turnover"] == 100
        assert vat.json()["vat_collected"] == 18

        ohada = client.get("/api/accounting/ohada-readiness", headers=headers)
        assert ohada.status_code == 200, ohada.text
        assert any(section["id"] == "accounting" for section in ohada.json()["sections"])

        insights = client.get("/api/limule/business-insights", headers=headers)
        assert insights.status_code == 200, insights.text
        insight_body = insights.json()
        assert insight_body["data_quality"] in {"partial", "good"}
        assert {"overdue_invoices", "low_stock", "fiscal_deadline", "task_deadline"} <= {
            item["type"] for item in insight_body["anomalies"]
        }

        alerts = client.get("/api/limule/alerts", headers=headers)
        assert alerts.status_code == 200, alerts.text
        assert {"overdue_invoice", "low_stock", "fiscal_deadline", "task_deadline"} <= {
            item["type"] for item in alerts.json()
        }

        group = client.post(
            "/api/groups",
            headers=headers,
            json={"name": "Association priorité", "type": "association", "city": "Brazzaville", "currency": "XAF"},
        )
        assert group.status_code == 201, group.text
        portfolio = client.get("/api/groups/portfolio/summary", headers=headers)
        assert portfolio.status_code == 200, portfolio.text
        assert portfolio.json()["groups_total"] >= 1
        assert portfolio.json()["warnings"][0]["type"] == "unlinked_groups"

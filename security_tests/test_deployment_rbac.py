"""Contrôles adversariaux de déploiement non couverts par la suite principale."""

import os
from uuid import uuid4

os.environ.setdefault("DATABASE_URL", "sqlite:////private/tmp/kompta-security-audit.db")
os.environ.setdefault("ENVIRONMENT", "local")
os.environ.setdefault("SEED_DEMO", "true")
os.environ.setdefault("SECRET_KEY", "kompta-security-audit-secret")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "super2026")

from fastapi.testclient import TestClient

from app.main import app


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _register_company(client: TestClient, suffix: str) -> tuple[dict[str, str], dict]:
    payload = {
        "company_name": f"Audit {suffix}",
        "legal_name": f"Audit {suffix} SARL",
        "industry": "Services",
        "organization_type": "PME",
        "country": "Congo",
        "admin_full_name": f"Admin {suffix}",
        "admin_email": f"admin.{suffix}@audit.local",
        "admin_phone": f"+24206{suffix[:6]}",
        "password": "KomptaAudit123!",
        "accept_privacy": True,
        "accept_terms": True,
        "accept_disclaimer": True,
        "signatory_name": f"Admin {suffix}",
    }
    response = client.post("/api/auth/register-company", json=payload)
    assert response.status_code == 201, response.text
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    return headers, payload


def _create_role(client: TestClient, headers: dict[str, str], name: str) -> dict:
    response = client.post(
        "/api/roles",
        headers=headers,
        json={
            "name": name,
            "scope": "company",
            "permissions": [],
            "description": "Rôle sans permission pour audit",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_company_admin_cannot_modify_another_tenants_role() -> None:
    with TestClient(app) as client:
        a_headers, _ = _register_company(client, uuid4().hex[:8])
        b_headers, _ = _register_company(client, uuid4().hex[:8])
        role_b = _create_role(client, b_headers, "Rôle société B")

        response = client.patch(
            f"/api/roles/{role_b['id']}",
            headers=a_headers,
            json={
                "name": "Rôle détourné",
                "scope": "company",
                "permissions": ["billing"],
                "description": "Modification cross-tenant",
            },
        )
        assert response.status_code in {403, 404}, response.text


def test_company_admin_cannot_assign_another_tenants_role() -> None:
    with TestClient(app) as client:
        a_headers, _ = _register_company(client, uuid4().hex[:8])
        b_headers, _ = _register_company(client, uuid4().hex[:8])
        role_b = _create_role(client, b_headers, "Rôle société B assignation")

        users = client.get("/api/company/users", headers=a_headers)
        assert users.status_code == 200, users.text
        target_user_id = users.json()[0]["id"]
        response = client.patch(
            f"/api/users/{target_user_id}/custom-role",
            headers=a_headers,
            json={"custom_role_id": role_b["id"]},
        )
        assert response.status_code in {403, 404}, response.text


def test_custom_role_without_crm_permission_cannot_create_opportunity() -> None:
    with TestClient(app) as client:
        admin_headers = _login(client, "admin@kompta.local", "kompta123")
        role = _create_role(client, admin_headers, "Aucun accès CRM")
        users = client.get("/api/company/users", headers=admin_headers)
        assert users.status_code == 200, users.text
        finance = next(user for user in users.json() if user["email"] == "finance@kompta.local")
        assigned = client.patch(
            f"/api/users/{finance['id']}/custom-role",
            headers=admin_headers,
            json={"custom_role_id": role["id"]},
        )
        assert assigned.status_code == 200, assigned.text

        finance_headers = _login(client, "finance@kompta.local", "kompta123")
        response = client.post(
            "/api/crm/opportunities",
            headers=finance_headers,
            json={
                "title": "Opportunité interdite",
                "contact_name": "Audit",
                "estimated_amount_cents": 100000,
            },
        )
        assert response.status_code == 403, response.text


def test_crm_opportunity_cannot_be_converted_twice() -> None:
    with TestClient(app) as client:
        headers = _login(client, "admin@kompta.local", "kompta123")
        created = client.post(
            "/api/crm/opportunities",
            headers=headers,
            json={
                "title": f"Conversion unique {uuid4().hex[:8]}",
                "contact_name": "Client conversion",
                "estimated_amount_cents": 250000,
            },
        )
        assert created.status_code == 201, created.text
        opportunity_id = created.json()["id"]
        won = client.patch(
            f"/api/crm/opportunities/{opportunity_id}",
            headers=headers,
            json={"stage": "gagne"},
        )
        assert won.status_code == 200, won.text

        first = client.post(
            f"/api/crm/opportunities/{opportunity_id}/convert-to-invoice",
            headers=headers,
        )
        assert first.status_code == 201, first.text
        second = client.post(
            f"/api/crm/opportunities/{opportunity_id}/convert-to-invoice",
            headers=headers,
        )
        assert second.status_code == 409, second.text


def test_cashier_cannot_provision_client_portal_password() -> None:
    with TestClient(app) as client:
        admin_headers = _login(client, "admin@kompta.local", "kompta123")
        created = client.post(
            "/api/clients",
            headers=admin_headers,
            json={
                "name": f"Client portail {uuid4().hex[:8]}",
                "email": f"portal.{uuid4().hex[:8]}@audit.local",
                "phone": "+242060000088",
            },
        )
        assert created.status_code == 201, created.text

        cashier_headers = _login(client, "caissier@kompta.local", "kompta123")
        response = client.post(
            "/api/portal/auth/set-password",
            headers=cashier_headers,
            json={"client_id": created.json()["id"]},
        )
        assert response.status_code == 403, response.text


def test_cashier_cannot_change_company_collection_coordinates() -> None:
    with TestClient(app) as client:
        cashier_headers = _login(client, "caissier@kompta.local", "kompta123")
        response = client.post(
            "/api/payments/methods",
            headers=cashier_headers,
            json={
                "provider": "bank_transfer",
                "label": "Compte frauduleux",
                "enabled": True,
                "bank_name": "Banque audit",
                "bank_account": "CG00-AUDIT-ATTACKER",
                "account_name": "Compte tiers",
            },
        )
        assert response.status_code == 403, response.text


def test_direct_payment_requires_a_real_sale_or_invoice() -> None:
    with TestClient(app) as client:
        admin_headers = _login(client, "admin@kompta.local", "kompta123")
        method = client.post(
            "/api/payments/methods",
            headers=admin_headers,
            json={"provider": "cash", "label": "Espèces audit", "enabled": True},
        )
        assert method.status_code == 200, method.text
        response = client.post(
            "/api/payments/record",
            headers=admin_headers,
            json={
                "method_id": method.json()["id"],
                "amount_cents": 100,
                "currency": "XAF",
                "description": "Paiement sans pièce",
            },
        )
        assert response.status_code in {400, 422}, response.text

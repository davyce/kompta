"""Tests du système d'abonnement plateforme :
plans, promotions, checkout plan gratuit, suspension (402) + réactivation, grant."""
from fastapi.testclient import TestClient

from app.main import app


def _admin(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _super(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "superadmin@kompta.io", "password": "super2026"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _company_id(client: TestClient, headers: dict) -> int:
    return client.get("/api/company/profile", headers=headers).json()["id"]


def test_company_can_list_plans() -> None:
    with TestClient(app) as client:
        r = client.get("/api/subscription/plans", headers=_admin(client))
        assert r.status_code == 200
        codes = {p["code"] for p in r.json()}
        assert {"starter", "pro", "business"} <= codes


def test_super_admin_promo_and_validation() -> None:
    with TestClient(app) as client:
        sup = _super(client)
        # Crée une promo -25% sur le plan pro
        r = client.post("/api/admin/subscription/promotions", headers=sup, json={
            "code": "test25", "description": "Test", "percent_off": 25, "plan_code": "pro",
        })
        assert r.status_code in (200, 409), r.text  # 409 si déjà créée par un run précédent

        # L'entreprise valide la promo
        adm = _admin(client)
        v = client.post("/api/subscription/promo/validate", headers=adm,
                        json={"code": "TEST25", "plan_code": "pro"})
        assert v.status_code == 200
        body = v.json()
        assert body["valid"] is True
        assert body["percent_off"] == 25
        assert body["final_cents"] == 1_500_000 - 375_000  # 25% de 15 000

        # Nettoyage
        promos = client.get("/api/admin/subscription/promotions", headers=sup).json()
        pid = next((p["id"] for p in promos if p["code"] == "TEST25"), None)
        if pid:
            client.delete(f"/api/admin/subscription/promotions/{pid}", headers=sup)


def test_checkout_free_plan_activates() -> None:
    with TestClient(app) as client:
        adm = _admin(client)
        r = client.post("/api/subscription/checkout", headers=adm,
                        json={"plan_code": "starter", "method": "card"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"  # plan gratuit → activation immédiate
        me = client.get("/api/subscription/me", headers=adm).json()
        assert me["status"] in ("active", "trialing")
        assert me["plan_code"] == "starter"


def test_super_admin_suspend_blocks_then_reactivate() -> None:
    with TestClient(app) as client:
        sup = _super(client)
        adm = _admin(client)
        cid = _company_id(client, adm)

        # Avant : route métier accessible
        assert client.get("/api/products", headers=adm).status_code == 200

        # Super-admin suspend
        s = client.post(f"/api/admin/subscription/companies/{cid}/suspend", headers=sup)
        assert s.status_code == 200, s.text

        # Le token de l'entreprise est maintenant bloqué (402) sur les routes métier
        blocked = client.get("/api/products", headers=adm)
        assert blocked.status_code == 402, blocked.text
        assert blocked.json().get("code") == "subscription_suspended"

        # Mais l'abonnement reste consultable (exempt)
        assert client.get("/api/subscription/me", headers=adm).status_code == 200

        # Réactivation
        r = client.post(f"/api/admin/subscription/companies/{cid}/reactivate", headers=sup)
        assert r.status_code == 200
        assert client.get("/api/products", headers=adm).status_code == 200


def test_super_admin_grant_period() -> None:
    with TestClient(app) as client:
        sup = _super(client)
        adm = _admin(client)
        cid = _company_id(client, adm)
        r = client.post(f"/api/admin/subscription/companies/{cid}/grant", headers=sup,
                        json={"plan_code": "pro", "days": 30})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"
        me = client.get("/api/subscription/me", headers=adm).json()
        assert me["plan_code"] == "pro"
        assert me["current_period_end"] is not None

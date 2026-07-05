"""Tests du système d'abonnement plateforme :
plans, promotions, checkout plan gratuit, suspension (402) + réactivation, grant."""
from fastapi.testclient import TestClient
from sqlalchemy import select

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
        assert body["final_cents"] == 500_000 - 125_000  # 25% de 5 000 (Musala)

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


def test_unlimited_grant_survives_shorter_real_payment_but_not_longer() -> None:
    """Un forfait "illimité" accordé par le super-admin (ex-Guideline utilisateur:
    Apple/Stripe/MoMo ne doivent jamais l'écraser silencieusement) doit résister
    à un paiement réel plus court, mais céder la place à un paiement qui offre
    réellement une période plus longue que le don."""
    import uuid

    from app.db.session import SessionLocal
    from app.models import Company, SubscriptionPlan
    from app.services import subscriptions as subs

    with TestClient(app) as client:
        sup = _super(client)
        email = f"unlimited_{uuid.uuid4().hex[:8]}@kompta.local"
        reg = client.post("/api/auth/register-company", json={
            "company_name": "Illimite SARL", "admin_full_name": "Boss", "admin_email": email,
            "admin_phone": "", "password": "kompta123",
            "signatory_name": "Test Signataire", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
        })
        assert reg.status_code == 201, reg.text
        adm = {"Authorization": f"Bearer {reg.json()['access_token']}"}
        cid = _company_id(client, adm)

        g = client.post(f"/api/admin/subscription/companies/{cid}/grant", headers=sup,
                        json={"plan_code": "business", "days": 30, "unlimited": True})
        assert g.status_code == 200, g.text
        assert g.json()["admin_granted"] is True
        me = client.get("/api/subscription/me", headers=adm).json()
        assert me["plan_code"] == "business"
        granted_end = me["current_period_end"]

        # Paiement réel plus court (30 jours "pro") : ne doit PAS écraser le don.
        with SessionLocal() as db:
            plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == "pro"))
            subs.activate_after_payment(db, cid, plan)
        me2 = client.get("/api/subscription/me", headers=adm).json()
        assert me2["plan_code"] == "business", "le don illimité ne doit pas être raccourci"
        assert me2["current_period_end"] == granted_end

        with SessionLocal() as db:
            row = db.scalar(select(Company).where(Company.id == cid))
            assert row is not None  # sanity : l'entreprise existe toujours

        # Paiement réel qui dépasse VRAIMENT le don (ex. 200 ans) : prend le relais.
        with SessionLocal() as db:
            plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == "pro"))
            from datetime import timedelta

            from app.models import CompanySubscription
            sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == cid))
            sub.current_period_end = subs._now() + timedelta(days=1)  # force une base proche pour le test
            db.commit()
            subs.activate_after_payment(db, cid, plan)
            db.refresh(sub)
            assert sub.admin_granted is False, "un paiement qui dépasse le don doit lever la protection"


# ── Entitlements (essai 3 mois + gating modules) ────────────────────────────
def test_new_company_gets_trial_with_full_access() -> None:
    import uuid
    with TestClient(app) as client:
        email = f"trial_{uuid.uuid4().hex[:8]}@kompta.local"
        r = client.post("/api/auth/register-company", json={
            "company_name": "Essai SARL", "admin_full_name": "Boss", "admin_email": email,
            "admin_phone": "", "password": "kompta123",
            "signatory_name": "Test Signataire", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
        })
        assert r.status_code == 201, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        ent = client.get("/api/subscription/entitlements", headers=h).json()
        assert ent["trialing"] is True
        assert ent["allowed_modules"] is None        # accès complet pendant l'essai
        assert ent["trial_days_left"] > 80           # ~90 jours
        # Un module premium est accessible pendant l'essai (pas de 402)
        assert client.get("/api/payroll", headers=h).status_code != 402


def test_new_company_trial_is_branded_mokonzi() -> None:
    """L'essai offert doit s'afficher comme Mokonzi (pas un essai générique)."""
    import uuid
    with TestClient(app) as client:
        email = f"mokonzi_trial_{uuid.uuid4().hex[:8]}@kompta.local"
        r = client.post("/api/auth/register-company", json={
            "company_name": "Mokonzi Essai SARL", "admin_full_name": "Boss", "admin_email": email,
            "admin_phone": "", "password": "kompta123",
            "signatory_name": "Test Signataire", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
        })
        assert r.status_code == 201, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        ent = client.get("/api/subscription/entitlements", headers=h).json()
        assert ent["plan_code"] == "business"
        assert ent["trial_ending_soon"] is False


def test_expired_trial_falls_back_to_standard_not_locked() -> None:
    """Un essai Mokonzi expiré doit retomber automatiquement sur Standard
    (accès conservé, pas de blocage), au lieu de verrouiller l'entreprise."""
    import uuid
    from datetime import timedelta

    from app.db.session import SessionLocal
    from app.models import CompanySubscription
    from app.services import subscriptions as subs

    with TestClient(app) as client:
        email = f"expired_trial_{uuid.uuid4().hex[:8]}@kompta.local"
        r = client.post("/api/auth/register-company", json={
            "company_name": "Essai Expire SARL", "admin_full_name": "Boss", "admin_email": email,
            "admin_phone": "", "password": "kompta123",
            "signatory_name": "Test Signataire", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
        })
        assert r.status_code == 201, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        cid = _company_id(client, h)

        with SessionLocal() as db:
            sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == cid))
            sub.current_period_end = subs._now() - timedelta(days=1)
            db.commit()

        ent = client.get("/api/subscription/entitlements", headers=h).json()
        assert ent["locked"] is False
        assert ent["plan_code"] == "starter"
        assert ent["status"] == "active"
        assert client.get("/api/products", headers=h).status_code != 402


def test_trial_ending_soon_flag_at_j5() -> None:
    import uuid
    from datetime import timedelta

    from app.db.session import SessionLocal
    from app.models import CompanySubscription
    from app.services import subscriptions as subs

    with TestClient(app) as client:
        email = f"j5_trial_{uuid.uuid4().hex[:8]}@kompta.local"
        r = client.post("/api/auth/register-company", json={
            "company_name": "J5 SARL", "admin_full_name": "Boss", "admin_email": email,
            "admin_phone": "", "password": "kompta123",
            "signatory_name": "Test Signataire", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
        })
        assert r.status_code == 201, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        cid = _company_id(client, h)

        with SessionLocal() as db:
            sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == cid))
            sub.current_period_end = subs._now() + timedelta(days=4)
            db.commit()

        ent = client.get("/api/subscription/entitlements", headers=h).json()
        assert ent["trialing"] is True
        assert ent["trial_ending_soon"] is True


def test_plans_expose_entitlements() -> None:
    with TestClient(app) as client:
        plans = {p["code"]: p for p in client.get("/api/subscription/plans", headers=_admin(client)).json()}
        assert plans["starter"]["max_users"] == 2
        assert plans["pro"]["max_users"] == 10
        assert plans["business"]["max_users"] == 0
        assert "payroll" in plans["pro"]["included_modules"]
        assert "teras" not in plans["pro"]["included_modules"]
        assert "teras" in plans["business"]["included_modules"]

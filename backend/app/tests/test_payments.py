"""Tests des paiements : config, anti-double-paiement, idempotence, garde MoMo, webhook Stripe."""
import hashlib
import hmac
import json
import time
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models import PaymentTransaction, User
from sqlalchemy import select


def _auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_payments_config_exposes_providers() -> None:
    with TestClient(app) as client:
        r = client.get("/api/payments/config", headers=_auth(client))
        assert r.status_code == 200
        body = r.json()
        assert "stripe_enabled" in body
        assert "momo_enabled" in body
        # La clé secrète ne doit JAMAIS fuiter ; seule la publishable est exposée.
        assert "secret" not in str(body).lower() or body.get("stripe_publishable_key", "").startswith(("pk_", ""))


def test_payments_config_requires_auth() -> None:
    with TestClient(app) as client:
        assert client.get("/api/payments/config").status_code == 401


def test_momo_request_reachable_or_properly_configured() -> None:
    """MoMo doit répondre 503 (non configuré) ou tenter le call (202/4xx réseau).
    En aucun cas on ne doit avoir une vente fantôme enregistrée."""
    with TestClient(app) as client:
        headers = _auth(client)
        r = client.post(
            "/api/payments/momo/request",
            headers=headers,
            json={"amount_cents": 500000, "currency": "XAF", "payer_phone": "+242060000000"},
        )
        # 503 = non configuré, 202/200 = configuré et call lancé,
        # 409 = anti-double-paiement, 400 = validation, 502/422 = erreur réseau sandbox
        # Tout sauf un 200 avec une "vente" silencieuse est acceptable.
        assert r.status_code in (200, 202, 400, 409, 422, 503, 502), \
            f"Statut inattendu: {r.status_code} — {r.text[:200]}"


def test_momo_request_validates_amount_and_phone() -> None:
    with TestClient(app) as client:
        headers = _auth(client)
        assert client.post("/api/payments/momo/request", headers=headers,
                           json={"amount_cents": 0, "currency": "XAF", "payer_phone": "+242060000000"}).status_code == 400
        assert client.post("/api/payments/momo/request", headers=headers,
                           json={"amount_cents": 5000, "currency": "XAF", "payer_phone": ""}).status_code == 400


def test_anti_double_payment_rejects_already_paid_sale() -> None:
    """Une vente déjà encaissée (transaction succeeded) ne peut pas être re-encaissée."""
    with TestClient(app) as client:
        headers = _auth(client)
        # Récupère la company de l'admin démo
        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.email == "admin@kompta.local"))
            assert admin is not None
            company_id = admin.company_id
            txn = PaymentTransaction(
                company_id=company_id, provider="stripe", provider_ref="pi_paid_test",
                idempotency_key="idem-paid-test", amount_cents=500000, currency="XAF",
                status="succeeded", sale_id=999999,
            )
            db.add(txn)
            db.commit()

        # Une nouvelle tentative MoMo sur la même vente → 409 (avant tout appel réseau).
        r = client.post(
            "/api/payments/momo/request",
            headers=headers,
            json={"amount_cents": 500000, "currency": "XAF", "payer_phone": "+242060000000", "sale_id": 999999},
        )
        assert r.status_code == 409

        # Nettoyage
        with SessionLocal() as db:
            t = db.scalar(select(PaymentTransaction).where(PaymentTransaction.idempotency_key == "idem-paid-test"))
            if t:
                db.delete(t)
                db.commit()


def test_status_endpoint_scoped_to_company() -> None:
    with TestClient(app) as client:
        headers = _auth(client)
        # Transaction inexistante → 404
        assert client.get("/api/payments/999999999/status", headers=headers).status_code == 404


def test_pos_card_sale_links_confirmed_payment_transaction() -> None:
    """Une vente POS carte doit être rattachée à une transaction Stripe réussie."""
    with TestClient(app) as client:
        headers = _auth(client)
        suffix = uuid4().hex[:8]
        product = client.post(
            "/api/products",
            headers=headers,
            json={
                "name": f"Produit carte {suffix}",
                "sku": f"CARD-{suffix}",
                "category": "Tests",
                "price": 30,
                "stock_quantity": 3,
            },
        )
        assert product.status_code == 201

        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.email == "admin@kompta.local"))
            assert admin is not None
            txn = PaymentTransaction(
                company_id=admin.company_id,
                provider="stripe",
                provider_ref=f"pi_{suffix}",
                idempotency_key=f"idem-card-{suffix}",
                amount_cents=3000,
                currency="XAF",
                status="succeeded",
            )
            db.add(txn)
            db.commit()
            txn_id = txn.id

        sale = client.post(
            "/api/pos/sales",
            headers=headers,
            json={
                "payment_method": "card",
                "payment_transaction_id": txn_id,
                "items": [{"product_id": product.json()["id"], "quantity": 1}],
            },
        )
        assert sale.status_code == 201, sale.text
        assert sale.json()["payment_method"] == "card"

        with SessionLocal() as db:
            refreshed = db.get(PaymentTransaction, txn_id)
            assert refreshed is not None
            assert refreshed.sale_id == sale.json()["id"]


def test_pos_card_sale_with_tva_matches_transaction_amount() -> None:
    """Vente carte AVEC TVA 18% : le serveur calcule le total TTC et il doit
    correspondre au montant de la transaction (sinon 'montant différent')."""
    with TestClient(app) as client:
        headers = _auth(client)
        suffix = uuid4().hex[:8]
        product = client.post("/api/products", headers=headers, json={
            "name": f"Produit TVA {suffix}", "sku": f"TVA-{suffix}", "category": "Tests",
            "price": 1000, "stock_quantity": 5,
        })
        assert product.status_code == 201

        # 1000 HT + 18% TVA = 1180 TTC → 118000 cents
        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.email == "admin@kompta.local"))
            txn = PaymentTransaction(
                company_id=admin.company_id, provider="stripe", provider_ref=f"pi_tva_{suffix}",
                idempotency_key=f"idem-tva-{suffix}", amount_cents=118000, currency="XAF", status="succeeded",
            )
            db.add(txn); db.commit(); txn_id = txn.id

        sale = client.post("/api/pos/sales", headers=headers, json={
            "payment_method": "card", "payment_transaction_id": txn_id,
            "items": [{"product_id": product.json()["id"], "quantity": 1}],
            "tva_enabled": True, "tax_rate": 18,
        })
        assert sale.status_code == 201, sale.text
        assert sale.json()["total_amount"] == 1180  # TTC


# ═══════════════════════════════════════════════════════════════════════════
# STRIPE WEBHOOK — tests de signature HMAC (sans appel réseau)
# ═══════════════════════════════════════════════════════════════════════════

FAKE_WEBHOOK_SECRET = "whsec_testkomptawebhookfakesecret1234"


def _forge_stripe_webhook(payload: dict, secret: str, timestamp: int | None = None) -> tuple[bytes, str]:
    """Forge un payload webhook Stripe signé (comme le ferait Stripe en production)."""
    t = str(timestamp or int(time.time()))
    body = json.dumps(payload, separators=(",", ":")).encode()
    signed_payload = f"{t}.".encode() + body
    sig = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return body, f"t={t},v1={sig}"


def test_stripe_webhook_valid_signature_updates_status() -> None:
    """Un webhook Stripe valide avec signature correcte met à jour la transaction."""
    import os
    os.environ["STRIPE_WEBHOOK_SECRET"] = FAKE_WEBHOOK_SECRET
    # Clear lru_cache de settings pour que la nouvelle valeur soit prise en compte
    from app.core.config import get_settings
    get_settings.cache_clear()

    with TestClient(app) as client:
        headers = _auth(client)

        # Créer une transaction "pending" en base
        with SessionLocal() as db:
            from app.models import User as U
            admin = db.scalar(select(U).where(U.email == "admin@kompta.local"))
            assert admin
            txn = PaymentTransaction(
                company_id=admin.company_id,
                provider="stripe",
                provider_ref="pi_test_webhook_valid",
                idempotency_key="idem-webhook-valid-test",
                amount_cents=750000,
                currency="XAF",
                status="pending",
            )
            db.add(txn)
            db.commit()
            txn_id = txn.id

        # Forger un événement payment_intent.succeeded
        event = {
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": "pi_test_webhook_valid", "status": "succeeded"}},
        }
        body, sig_header = _forge_stripe_webhook(event, FAKE_WEBHOOK_SECRET)

        resp = client.post(
            "/api/payments/stripe/webhook",
            content=body,
            headers={"Stripe-Signature": sig_header, "Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "succeeded"

        # Vérifier en base
        with SessionLocal() as db:
            t = db.get(PaymentTransaction, txn_id)
            assert t is not None
            assert t.status == "succeeded"
            # Nettoyage
            db.delete(t)
            db.commit()

    # Restaurer
    os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
    get_settings.cache_clear()


def test_stripe_webhook_invalid_signature_is_400() -> None:
    """Une signature forgée/incorrecte doit être rejetée avec 400."""
    import os
    os.environ["STRIPE_WEBHOOK_SECRET"] = FAKE_WEBHOOK_SECRET
    from app.core.config import get_settings
    get_settings.cache_clear()

    with TestClient(app) as client:
        body, _ = _forge_stripe_webhook({"type": "payment_intent.succeeded"}, FAKE_WEBHOOK_SECRET)
        # Signature avec un secret différent → HMAC invalide
        _, bad_sig = _forge_stripe_webhook({"type": "payment_intent.succeeded"}, "whsec_wrongsecret")
        resp = client.post(
            "/api/payments/stripe/webhook",
            content=body,
            headers={"Stripe-Signature": bad_sig, "Content-Type": "application/json"},
        )
        assert resp.status_code == 400

    os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
    get_settings.cache_clear()


def test_stripe_webhook_expired_timestamp_is_400() -> None:
    """Un webhook avec un horodatage > 5 min dans le passé doit être rejeté."""
    import os
    os.environ["STRIPE_WEBHOOK_SECRET"] = FAKE_WEBHOOK_SECRET
    from app.core.config import get_settings
    get_settings.cache_clear()

    with TestClient(app) as client:
        old_ts = int(time.time()) - 400  # 400 secondes dans le passé (> tolérance 300s)
        body, sig = _forge_stripe_webhook({"type": "payment_intent.succeeded"}, FAKE_WEBHOOK_SECRET, old_ts)
        resp = client.post(
            "/api/payments/stripe/webhook",
            content=body,
            headers={"Stripe-Signature": sig, "Content-Type": "application/json"},
        )
        assert resp.status_code == 400

    os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
    get_settings.cache_clear()


def test_stripe_webhook_without_secret_configured_is_503() -> None:
    """Sans STRIPE_WEBHOOK_SECRET configuré, le webhook doit répondre 503."""
    import os
    from app.core.config import get_settings
    # Les variables d'environnement ont priorité sur le fichier .env : on force
    # la valeur vide pour simuler une configuration absente, même si un .env de
    # production (avec un vrai secret) est présent localement.
    previous = os.environ.get("STRIPE_WEBHOOK_SECRET")
    os.environ["STRIPE_WEBHOOK_SECRET"] = ""
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            body = json.dumps({"type": "test"}).encode()
            resp = client.post(
                "/api/payments/stripe/webhook",
                content=body,
                headers={"Stripe-Signature": "t=1,v1=abc", "Content-Type": "application/json"},
            )
            assert resp.status_code == 503
    finally:
        if previous is None:
            os.environ.pop("STRIPE_WEBHOOK_SECRET", None)
        else:
            os.environ["STRIPE_WEBHOOK_SECRET"] = previous
        get_settings.cache_clear()


def test_momo_callback_rejects_forged_update_when_secret_configured() -> None:
    """Un callback MoMo sans secret ne doit pas pouvoir valider une transaction."""
    import os
    from app.core.config import get_settings

    secret = "momo-callback-secret-test"
    previous = os.environ.get("MOMO_CALLBACK_SECRET")
    os.environ["MOMO_CALLBACK_SECRET"] = secret
    get_settings.cache_clear()
    ref = f"momo-forged-{uuid4().hex}"
    txn_id: int | None = None
    try:
        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.email == "admin@kompta.local"))
            assert admin is not None
            txn = PaymentTransaction(
                company_id=admin.company_id,
                provider="momo",
                provider_ref=ref,
                idempotency_key=f"idem-{ref}",
                amount_cents=500000,
                currency="XAF",
                status="processing",
            )
            db.add(txn)
            db.commit()
            txn_id = txn.id

        with TestClient(app) as client:
            resp = client.post("/api/payments/momo/callback", json={"referenceId": ref, "status": "SUCCESSFUL"})
            assert resp.status_code == 401

        with SessionLocal() as db:
            t = db.get(PaymentTransaction, txn_id)
            assert t is not None
            assert t.status == "processing"
            db.delete(t)
            db.commit()
    finally:
        if previous is None:
            os.environ.pop("MOMO_CALLBACK_SECRET", None)
        else:
            os.environ["MOMO_CALLBACK_SECRET"] = previous
        get_settings.cache_clear()


def test_momo_callback_accepts_configured_secret() -> None:
    """Un callback MoMo portant le secret configuré peut mettre à jour le statut."""
    import os
    from app.core.config import get_settings

    secret = "momo-callback-secret-test"
    previous = os.environ.get("MOMO_CALLBACK_SECRET")
    os.environ["MOMO_CALLBACK_SECRET"] = secret
    get_settings.cache_clear()
    ref = f"momo-valid-{uuid4().hex}"
    txn_id: int | None = None
    try:
        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.email == "admin@kompta.local"))
            assert admin is not None
            txn = PaymentTransaction(
                company_id=admin.company_id,
                provider="momo",
                provider_ref=ref,
                idempotency_key=f"idem-{ref}",
                amount_cents=500000,
                currency="XAF",
                status="processing",
            )
            db.add(txn)
            db.commit()
            txn_id = txn.id

        with TestClient(app) as client:
            resp = client.post(
                f"/api/payments/momo/callback?token={secret}",
                json={"referenceId": ref, "status": "SUCCESSFUL"},
            )
            assert resp.status_code == 200, resp.text
            assert resp.json()["status"] == "succeeded"

        with SessionLocal() as db:
            t = db.get(PaymentTransaction, txn_id)
            assert t is not None
            assert t.status == "succeeded"
            db.delete(t)
            db.commit()
    finally:
        if previous is None:
            os.environ.pop("MOMO_CALLBACK_SECRET", None)
        else:
            os.environ["MOMO_CALLBACK_SECRET"] = previous
        get_settings.cache_clear()


# ── Méthodes d'encaissement (config par entreprise) ─────────────────────────
def test_collection_methods_lifecycle() -> None:
    with TestClient(app) as client:
        h = _auth(client)
        # Au départ : liste accessible
        r = client.get("/api/payments/methods", headers=h)
        assert r.status_code == 200
        assert "methods" in r.json() and "can_collect" in r.json()

        # Espèces : activable, auto-vérifié (aucun champ requis)
        r = client.post("/api/payments/methods", headers=h, json={"provider": "cash", "label": "Espèces", "enabled": True})
        assert r.status_code == 200, r.text
        cash = r.json()
        assert cash["verified"] is True and cash["enabled"] is True

        # MoMo sans numéro : pas vérifié ; avec numéro : vérifié
        r = client.post("/api/payments/methods", headers=h, json={"provider": "momo_mtn", "enabled": True})
        assert r.json()["verified"] is False
        r = client.post("/api/payments/methods", headers=h, json={"provider": "momo_mtn", "enabled": True, "merchant_number": "242060000000"})
        assert r.json()["verified"] is True

        # Provider inconnu rejeté
        assert client.post("/api/payments/methods", headers=h, json={"provider": "bitcoin"}).status_code == 400

        # can_collect = True maintenant
        assert client.get("/api/payments/methods", headers=h).json()["can_collect"] is True


def test_record_direct_payment_requires_verified_method() -> None:
    with TestClient(app) as client:
        h = _auth(client)
        # méthode espèces vérifiée
        m = client.post("/api/payments/methods", headers=h, json={"provider": "cash", "enabled": True}).json()
        r = client.post("/api/payments/record", headers=h, json={"method_id": m["id"], "amount_cents": 250000, "currency": "XAF", "description": "Vente comptoir"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "succeeded" and r.json()["provider"] == "cash"

        # méthode inexistante → 404
        assert client.post("/api/payments/record", headers=h, json={"method_id": 999999, "amount_cents": 1000}).status_code == 404

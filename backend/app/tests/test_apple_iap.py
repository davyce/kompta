"""Tests Apple In-App Purchase (StoreKit 2) — endpoint /payments/apple/verify.

La vérification JWS réelle (chaîne de certificats x5c Apple) n'est pas
falsifiable simplement dans un test unitaire (il faudrait un vrai certificat
signé par Apple). On mocke donc `app.services.payments.verify_apple_jws`
directement — exactement le même principe que le test Stripe qui forge la
signature HMAC plutôt que d'appeler la vraie API Stripe : on isole la logique
métier (idempotence, mapping produit → plan, activation d'abonnement) de la
mécanique de vérification cryptographique, qui est testée séparément par
`test_verify_apple_jws_rejects_missing_x5c` ci-dessous (sans mock).
"""
from __future__ import annotations

import json
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models import PaymentTransaction, SubscriptionPlan, User
from app.services import payments as pay
from sqlalchemy import select


def _auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _fake_claims(apple_txn_id: str, product_id: str) -> dict:
    return {
        "transactionId": apple_txn_id,
        "originalTransactionId": apple_txn_id,
        "productId": product_id,
        "type": "Auto-Renewable Subscription",
        "purchaseDate": 1_700_000_000_000,
        "expiresDate": 1_702_600_000_000,
    }


def test_verify_apple_jws_rejects_missing_x5c() -> None:
    """Sans en-tête x5c, la vérification doit échouer proprement (400), jamais
    planter — comportement réel sur un JWS malformé ou non-Apple."""
    import jwt

    bogus = jwt.encode({"foo": "bar"}, key="not-really-a-key", algorithm="HS256")
    try:
        pay.verify_apple_jws(bogus)
        assert False, "devrait lever PaymentError"
    except pay.PaymentError as e:
        assert e.status == 400


def test_apple_verify_endpoint_idempotent_activation(monkeypatch) -> None:
    """Deux appels avec la même transactionId Apple → une seule PaymentTransaction
    créée, une seule activation d'abonnement (pas de double-traitement)."""
    apple_txn_id = f"2000000{uuid4().hex[:9]}"
    product_id = "com.adansonia.kompta.subscription.pro.monthly"
    claims = _fake_claims(apple_txn_id, product_id)

    monkeypatch.setattr(pay, "verify_apple_jws", lambda signed: claims)

    with TestClient(app) as client:
        headers = _auth(client)

        with SessionLocal() as db:
            plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.apple_product_id == product_id))
            if not plan:
                plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == "pro"))
                assert plan is not None, "plan 'pro' doit exister (seedé par défaut)"
                plan.apple_product_id = product_id
                db.commit()

        body = {"signed_transaction": "fake-jws-irrelevant-because-mocked", "plan_code": "pro"}

        r1 = client.post("/api/payments/apple/verify", json=body, headers=headers)
        assert r1.status_code == 200, r1.text
        txn_id_1 = r1.json()["transaction_id"]
        assert r1.json()["status"] == "succeeded"
        assert r1.json()["plan_code"] == "pro"

        r2 = client.post("/api/payments/apple/verify", json=body, headers=headers)
        assert r2.status_code == 200, r2.text
        txn_id_2 = r2.json()["transaction_id"]

        assert txn_id_1 == txn_id_2, "la 2e soumission doit renvoyer la MÊME transaction (idempotence)"

        with SessionLocal() as db:
            count = db.scalar(
                select(PaymentTransaction).where(PaymentTransaction.provider_ref == apple_txn_id)
            )
            all_matching = db.scalars(
                select(PaymentTransaction).where(PaymentTransaction.provider_ref == apple_txn_id)
            ).all()
            assert len(all_matching) == 1, "une seule PaymentTransaction doit exister pour cette transactionId Apple"
            assert all_matching[0].provider == "apple_iap"
            assert all_matching[0].purpose == "subscription"


def test_apple_verify_unmapped_product_returns_422(monkeypatch) -> None:
    """Un productId Apple sans plan KOMPTA associé (ni via apple_product_id ni
    via le plan_code fourni) doit être rejeté proprement, pas planter."""
    apple_txn_id = f"3000000{uuid4().hex[:9]}"
    claims = _fake_claims(apple_txn_id, "com.adansonia.kompta.subscription.unknown_tier")
    monkeypatch.setattr(pay, "verify_apple_jws", lambda signed: claims)

    with TestClient(app) as client:
        headers = _auth(client)
        body = {"signed_transaction": "irrelevant", "plan_code": "does-not-exist"}
        r = client.post("/api/payments/apple/verify", json=body, headers=headers)
        assert r.status_code == 422, r.text

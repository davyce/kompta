"""Tests webhooks/callbacks paiement — complète test_payments.py sur les axes non
couverts : rejeu (idempotence "succeeded" ne double-traite pas), en-tête de
signature absent/malformé (400 propre, pas de 500), et callback MoMo sans
en-tête ni token (comportement selon secret configuré ou non).

Voir aussi app/tests/test_payments.py qui couvre déjà : signature valide,
signature invalide (HMAC faux), horodatage expiré, secret non configuré (503),
callback MoMo forgé rejeté (401) et callback MoMo valide accepté (200).
"""
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

FAKE_WEBHOOK_SECRET = "whsec_testkomptawebhookfakesecret1234"


def _auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _forge_stripe_webhook(payload: dict, secret: str, timestamp: int | None = None) -> tuple[bytes, str]:
    t = str(timestamp or int(time.time()))
    body = json.dumps(payload, separators=(",", ":")).encode()
    signed_payload = f"{t}.".encode() + body
    sig = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return body, f"t={t},v1={sig}"


def _with_stripe_secret():
    import os
    from app.core.config import get_settings
    os.environ["STRIPE_WEBHOOK_SECRET"] = FAKE_WEBHOOK_SECRET
    get_settings.cache_clear()
    return os, get_settings


def _restore_stripe_secret(os_mod, get_settings) -> None:
    os_mod.environ.pop("STRIPE_WEBHOOK_SECRET", None)
    get_settings.cache_clear()


# ═══════════════════════════════════════════════════════════════════════════
# STRIPE — en-tête de signature absent / malformé → 4xx propre, jamais un 500
# ═══════════════════════════════════════════════════════════════════════════
def test_stripe_webhook_missing_signature_header_is_400() -> None:
    os_mod, get_settings = _with_stripe_secret()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            body = json.dumps({"type": "payment_intent.succeeded"}).encode()
            resp = client.post(
                "/api/payments/stripe/webhook",
                content=body,
                headers={"Content-Type": "application/json"},  # pas de Stripe-Signature
            )
            assert resp.status_code == 400, resp.text
    finally:
        _restore_stripe_secret(os_mod, get_settings)


def test_stripe_webhook_malformed_signature_header_is_400() -> None:
    """En-tête présent mais sans les clés t=/v1= attendues."""
    os_mod, get_settings = _with_stripe_secret()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            body = json.dumps({"type": "payment_intent.succeeded"}).encode()
            resp = client.post(
                "/api/payments/stripe/webhook",
                content=body,
                headers={"Stripe-Signature": "not-a-valid-signature-format", "Content-Type": "application/json"},
            )
            assert resp.status_code == 400, resp.text
    finally:
        _restore_stripe_secret(os_mod, get_settings)


def test_stripe_webhook_garbage_body_does_not_crash() -> None:
    """Corps non-JSON avec signature valide sur les octets bruts : 400 propre, pas 500."""
    os_mod, get_settings = _with_stripe_secret()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            raw_body = b"this is not json at all {{{"
            t = str(int(time.time()))
            signed_payload = f"{t}.".encode() + raw_body
            sig = hmac.new(FAKE_WEBHOOK_SECRET.encode(), signed_payload, hashlib.sha256).hexdigest()
            resp = client.post(
                "/api/payments/stripe/webhook",
                content=raw_body,
                headers={"Stripe-Signature": f"t={t},v1={sig}", "Content-Type": "application/json"},
            )
            assert resp.status_code == 400, resp.text
    finally:
        _restore_stripe_secret(os_mod, get_settings)


# ═══════════════════════════════════════════════════════════════════════════
# STRIPE — rejeu (replay) : le même événement "succeeded" envoyé deux fois ne
# doit pas re-déclencher de traitement (statut reste "succeeded", pas d'erreur,
# et surtout pas de double écriture métier).
# ═══════════════════════════════════════════════════════════════════════════
def test_stripe_webhook_replay_is_idempotent() -> None:
    os_mod, get_settings = _with_stripe_secret()
    txn_id: int | None = None
    try:
        with TestClient(app) as client:
            _auth(client)  # s'assure que l'app est initialisée / la company démo existe

            with SessionLocal() as db:
                admin = db.scalar(select(User).where(User.email == "admin@kompta.local"))
                assert admin is not None
                ref = f"pi_replay_{uuid4().hex[:8]}"
                txn = PaymentTransaction(
                    company_id=admin.company_id,
                    provider="stripe",
                    provider_ref=ref,
                    idempotency_key=f"idem-{ref}",
                    amount_cents=420000,
                    currency="XAF",
                    status="pending",
                )
                db.add(txn)
                db.commit()
                txn_id = txn.id

            event = {
                "type": "payment_intent.succeeded",
                "data": {"object": {"id": ref, "status": "succeeded"}},
            }
            body, sig_header = _forge_stripe_webhook(event, FAKE_WEBHOOK_SECRET)
            headers = {"Stripe-Signature": sig_header, "Content-Type": "application/json"}

            first = client.post("/api/payments/stripe/webhook", content=body, headers=headers)
            assert first.status_code == 200
            assert first.json()["status"] == "succeeded"

            # Rejeu exact du même événement (même horodatage, même signature) :
            # le handler doit détecter que le statut est déjà "succeeded" et ne
            # rien re-traiter (cf. `if txn.status == "succeeded": return {"already": ...}`).
            second = client.post("/api/payments/stripe/webhook", content=body, headers=headers)
            assert second.status_code == 200
            assert second.json().get("already") == "succeeded"

            with SessionLocal() as db:
                t = db.get(PaymentTransaction, txn_id)
                assert t is not None
                assert t.status == "succeeded"
                # `last_event` doit correspondre au premier traitement, pas être
                # ré-écrit un grand nombre de fois — vérifie juste la valeur.
                assert t.last_event == "payment_intent.succeeded"
    finally:
        if txn_id is not None:
            with SessionLocal() as db:
                t = db.get(PaymentTransaction, txn_id)
                if t:
                    db.delete(t)
                    db.commit()
        _restore_stripe_secret(os_mod, get_settings)


def test_stripe_webhook_unknown_intent_ref_is_noop() -> None:
    """Un event Stripe valide pour un provider_ref inconnu ne doit rien casser."""
    os_mod, get_settings = _with_stripe_secret()
    try:
        with TestClient(app) as client:
            event = {
                "type": "payment_intent.succeeded",
                "data": {"object": {"id": "pi_never_seen_by_kompta", "status": "succeeded"}},
            }
            body, sig_header = _forge_stripe_webhook(event, FAKE_WEBHOOK_SECRET)
            resp = client.post(
                "/api/payments/stripe/webhook",
                content=body,
                headers={"Stripe-Signature": sig_header, "Content-Type": "application/json"},
            )
            assert resp.status_code == 200
            assert resp.json().get("ignored") == "unknown_intent"
    finally:
        _restore_stripe_secret(os_mod, get_settings)


# ═══════════════════════════════════════════════════════════════════════════
# MOMO — callback rejeu + en-tête/token absent quand secret configuré
# ═══════════════════════════════════════════════════════════════════════════
def test_momo_callback_replay_is_idempotent() -> None:
    import os
    from app.core.config import get_settings

    secret = "momo-callback-secret-replay-test"
    previous = os.environ.get("MOMO_CALLBACK_SECRET")
    os.environ["MOMO_CALLBACK_SECRET"] = secret
    get_settings.cache_clear()
    ref = f"momo-replay-{uuid4().hex}"
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
            payload = {"referenceId": ref, "status": "SUCCESSFUL"}
            first = client.post(f"/api/payments/momo/callback?token={secret}", json=payload)
            assert first.status_code == 200, first.text
            assert first.json()["status"] == "succeeded"

            # Rejeu du même callback : doit rester idempotent (pas de re-traitement).
            second = client.post(f"/api/payments/momo/callback?token={secret}", json=payload)
            assert second.status_code == 200, second.text
            assert second.json().get("already") == "succeeded"

        with SessionLocal() as db:
            t = db.get(PaymentTransaction, txn_id)
            assert t is not None
            assert t.status == "succeeded"
    finally:
        if txn_id is not None:
            with SessionLocal() as db:
                t = db.get(PaymentTransaction, txn_id)
                if t:
                    db.delete(t)
                    db.commit()
        if previous is None:
            os.environ.pop("MOMO_CALLBACK_SECRET", None)
        else:
            os.environ["MOMO_CALLBACK_SECRET"] = previous
        get_settings.cache_clear()


def test_momo_callback_missing_token_rejected_when_secret_configured() -> None:
    """Callback sans token ni en-tête alors qu'un secret est configuré → 401, jamais 500."""
    import os
    from app.core.config import get_settings

    secret = "momo-callback-secret-missing-test"
    previous = os.environ.get("MOMO_CALLBACK_SECRET")
    os.environ["MOMO_CALLBACK_SECRET"] = secret
    get_settings.cache_clear()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post("/api/payments/momo/callback", json={"referenceId": "whatever", "status": "SUCCESSFUL"})
            assert resp.status_code == 401
    finally:
        if previous is None:
            os.environ.pop("MOMO_CALLBACK_SECRET", None)
        else:
            os.environ["MOMO_CALLBACK_SECRET"] = previous
        get_settings.cache_clear()


def test_momo_callback_malformed_body_is_clean_4xx_not_500() -> None:
    """Corps non-JSON envoyé au callback MoMo (aucun secret configuré en test par défaut
    puisque non-production) : la route doit répondre proprement, jamais planter."""
    import os
    from app.core.config import get_settings

    previous = os.environ.get("MOMO_CALLBACK_SECRET")
    os.environ["MOMO_CALLBACK_SECRET"] = ""
    get_settings.cache_clear()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/payments/momo/callback",
                content=b"not-json-at-all",
                headers={"Content-Type": "application/json"},
            )
            # Le handler catch l'échec de parsing JSON (body = {}) puis constate
            # l'absence de référence → réponse "ignored", jamais un crash 500.
            assert resp.status_code < 500, resp.text
    finally:
        if previous is None:
            os.environ.pop("MOMO_CALLBACK_SECRET", None)
        else:
            os.environ["MOMO_CALLBACK_SECRET"] = previous
        get_settings.cache_clear()

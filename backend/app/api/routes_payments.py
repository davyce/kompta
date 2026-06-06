"""
routes_payments.py — Endpoints de paiement réels (Stripe carte + MTN MoMo).

Sécurité / fiabilité :
- Idempotence (idempotency_key unique par transaction).
- Anti-double-paiement (refus si une transaction réussie existe déjà pour la vente/facture).
- Webhook Stripe à signature vérifiée ; callback MoMo + polling de statut.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import PaymentTransaction, User
from app.services import payments as pay

router = APIRouter(tags=["payments"])
logger = logging.getLogger("kompta.payments")


# ── Schemas ────────────────────────────────────────────────────────────────
class StripeIntentRequest(BaseModel):
    amount_cents: int
    currency: str = "XAF"
    sale_id: int | None = None
    invoice_id: int | None = None
    description: str = ""


class MomoRequest(BaseModel):
    amount_cents: int
    currency: str = "XAF"
    payer_phone: str
    sale_id: int | None = None
    invoice_id: int | None = None
    description: str = ""


def _reject_if_already_paid(db: Session, company_id: int, sale_id: int | None, invoice_id: int | None) -> None:
    """Anti-double-paiement : une vente/facture déjà encaissée ne peut pas l'être à nouveau."""
    if not (sale_id or invoice_id):
        return
    conds = [PaymentTransaction.company_id == company_id, PaymentTransaction.status == "succeeded"]
    stmt = select(PaymentTransaction).where(*conds)
    if sale_id:
        stmt = stmt.where(PaymentTransaction.sale_id == sale_id)
    if invoice_id:
        stmt = stmt.where(PaymentTransaction.invoice_id == invoice_id)
    if db.scalar(stmt):
        raise HTTPException(409, "Cette vente/facture a déjà été encaissée.")


def _serialize(t: PaymentTransaction) -> dict:
    return {
        "id": t.id,
        "provider": t.provider,
        "provider_ref": t.provider_ref,
        "amount_cents": t.amount_cents,
        "currency": t.currency,
        "status": t.status,
        "sale_id": t.sale_id,
        "invoice_id": t.invoice_id,
        "failure_reason": t.failure_reason,
    }


# ═══════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════
@router.get("/payments/config")
def payments_config(current_user: User = Depends(get_current_user)) -> dict:
    settings = get_settings()
    return {
        "stripe_enabled": settings.stripe_enabled,
        "stripe_publishable_key": settings.stripe_publishable_key if settings.stripe_enabled else "",
        "momo_enabled": settings.momo_enabled,
    }


# ═══════════════════════════════════════════════════════════════════════════
# STRIPE
# ═══════════════════════════════════════════════════════════════════════════
@router.post("/payments/stripe/intent")
async def create_stripe_intent(
    payload: StripeIntentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if payload.amount_cents <= 0:
        raise HTTPException(400, "Montant invalide.")
    _reject_if_already_paid(db, current_user.company_id, payload.sale_id, payload.invoice_id)

    idem = pay.new_reference()
    txn = PaymentTransaction(
        company_id=current_user.company_id,
        provider="stripe",
        idempotency_key=idem,
        amount_cents=payload.amount_cents,
        currency=payload.currency.upper(),
        status="pending",
        sale_id=payload.sale_id,
        invoice_id=payload.invoice_id,
        description=payload.description,
    )
    db.add(txn)
    db.flush()

    try:
        intent = await pay.stripe_create_payment_intent(
            amount_cents=payload.amount_cents,
            currency=payload.currency,
            idempotency_key=idem,
            description=payload.description,
            metadata={"transaction_id": txn.id, "company_id": current_user.company_id},
        )
    except pay.PaymentError as e:
        txn.status = "failed"
        txn.failure_reason = e.message[:255]
        db.commit()
        raise HTTPException(e.status, e.message)

    txn.provider_ref = intent.get("id", "")
    txn.status = pay.normalize_status("stripe", intent.get("status", ""))
    txn.raw_response = json.dumps({"id": intent.get("id"), "status": intent.get("status")})
    db.commit()

    return {
        "transaction_id": txn.id,
        "client_secret": intent.get("client_secret"),
        "publishable_key": get_settings().stripe_publishable_key,
        "status": txn.status,
    }


@router.post("/payments/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    raw = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = pay.stripe_verify_webhook(raw, sig)
    except pay.PaymentError as e:
        raise HTTPException(e.status, e.message)

    event_type = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    intent_id = obj.get("id", "")
    if not intent_id:
        return {"received": True, "ignored": "no_intent_id"}

    txn = db.scalar(select(PaymentTransaction).where(PaymentTransaction.provider_ref == intent_id))
    if not txn:
        return {"received": True, "ignored": "unknown_intent"}

    # Idempotence : un événement déjà appliqué ne régresse pas un statut final.
    if txn.status == "succeeded":
        return {"received": True, "already": "succeeded"}

    if event_type == "payment_intent.succeeded":
        txn.status = "succeeded"
    elif event_type == "payment_intent.payment_failed":
        txn.status = "failed"
        txn.failure_reason = (obj.get("last_payment_error") or {}).get("message", "")[:255]
    elif event_type == "payment_intent.canceled":
        txn.status = "cancelled"
    txn.last_event = event_type
    db.commit()
    _activate_subscription_if_paid(db, txn)
    return {"received": True, "status": txn.status}


def _activate_subscription_if_paid(db: Session, txn: PaymentTransaction) -> None:
    """Si un paiement d'ABONNEMENT vient de réussir, active/prolonge l'abonnement.
    Idempotent : ne fait rien si déjà à la bonne période."""
    if getattr(txn, "purpose", "") != "subscription" or txn.status != "succeeded":
        return
    try:
        from app.models import SubscriptionPlan
        from app.services import subscriptions as _subs
        plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == txn.subscription_plan_code))
        if plan:
            _subs.activate_after_payment(db, txn.company_id, plan, "", txn.id)
    except Exception:
        logger.exception("Activation abonnement post-paiement échouée (txn %s)", txn.id)


# ═══════════════════════════════════════════════════════════════════════════
# MOBILE MONEY
# ═══════════════════════════════════════════════════════════════════════════
@router.post("/payments/momo/request")
async def create_momo_request(
    payload: MomoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if payload.amount_cents <= 0:
        raise HTTPException(400, "Montant invalide.")
    if not payload.payer_phone.strip():
        raise HTTPException(400, "Numéro du payeur requis.")
    _reject_if_already_paid(db, current_user.company_id, payload.sale_id, payload.invoice_id)

    reference = pay.new_reference()
    txn = PaymentTransaction(
        company_id=current_user.company_id,
        provider="momo",
        provider_ref=reference,
        idempotency_key=reference,
        amount_cents=payload.amount_cents,
        currency=payload.currency.upper(),
        status="pending",
        sale_id=payload.sale_id,
        invoice_id=payload.invoice_id,
        customer_phone=payload.payer_phone.strip(),
        description=payload.description,
    )
    db.add(txn)
    db.flush()

    try:
        await pay.momo_request_to_pay(
            reference_id=reference,
            amount_cents=payload.amount_cents,
            currency=payload.currency,
            payer_phone=payload.payer_phone.strip(),
            external_id=str(txn.id),
            payer_message=payload.description or "Paiement KOMPTA",
        )
    except pay.PaymentError as e:
        txn.status = "failed"
        txn.failure_reason = e.message[:255]
        db.commit()
        raise HTTPException(e.status, e.message)

    txn.status = "processing"
    db.commit()
    return {"transaction_id": txn.id, "reference": reference, "status": txn.status}


@router.post("/payments/momo/callback")
async def momo_callback(request: Request, db: Session = Depends(get_db)) -> dict:
    """Callback MoMo (X-Callback-Url). Met à jour le statut de la transaction."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    reference = request.headers.get("X-Reference-Id") or body.get("referenceId") or body.get("externalId", "")
    if not reference:
        return {"received": True, "ignored": "no_reference"}
    txn = db.scalar(select(PaymentTransaction).where(PaymentTransaction.provider_ref == reference))
    if not txn:
        return {"received": True, "ignored": "unknown_reference"}
    if txn.status == "succeeded":
        return {"received": True, "already": "succeeded"}
    txn.status = pay.normalize_status("momo", body.get("status", ""))
    txn.last_event = json.dumps(body)[:2000]
    if txn.status == "failed":
        txn.failure_reason = body.get("reason", "")[:255]
    db.commit()
    _activate_subscription_if_paid(db, txn)
    return {"received": True, "status": txn.status}


# ═══════════════════════════════════════════════════════════════════════════
# STATUT (polling) — commun aux deux prestataires
# ═══════════════════════════════════════════════════════════════════════════
@router.get("/payments/{txn_id}/status")
async def payment_status(
    txn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    txn = db.get(PaymentTransaction, txn_id)
    if not txn or txn.company_id != current_user.company_id:
        raise HTTPException(404, "Transaction introuvable.")

    # Pour Stripe/MoMo en cours, on rafraîchit le statut depuis le prestataire.
    if txn.provider == "stripe" and txn.status in {"pending", "processing"} and txn.provider_ref:
        try:
            data = await pay.stripe_retrieve_payment_intent(txn.provider_ref)
            new_status = pay.normalize_status("stripe", data.get("status", ""))
            if new_status != txn.status:
                txn.status = new_status
                if new_status == "failed":
                    txn.failure_reason = ((data.get("last_payment_error") or {}).get("message", ""))[:255]
                txn.raw_response = json.dumps({"id": data.get("id"), "status": data.get("status")})[:2000]
                db.commit()
        except pay.PaymentError:
            pass  # garder le statut courant si le prestataire est momentanément indisponible

    if txn.provider == "momo" and txn.status == "processing":
        try:
            data = await pay.momo_get_status(txn.provider_ref)
            new_status = pay.normalize_status("momo", data.get("status", ""))
            if new_status != txn.status:
                txn.status = new_status
                if new_status == "failed":
                    txn.failure_reason = data.get("reason", "")[:255]
                txn.last_event = json.dumps(data)[:2000]
                db.commit()
        except pay.PaymentError:
            pass  # garder le statut courant si le prestataire est momentanément indisponible

    _activate_subscription_if_paid(db, txn)
    return _serialize(txn)

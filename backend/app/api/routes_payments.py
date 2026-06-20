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
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import CompanyPaymentMethod, PaymentTransaction, User
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
async def momo_callback(
    request: Request,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Callback MoMo (X-Callback-Url). Met à jour le statut de la transaction."""
    settings = get_settings()
    if settings.momo_callback_secret:
        provided = (
            token
            or request.headers.get("X-KOMPTA-MOMO-CALLBACK-SECRET")
            or request.headers.get("X-Callback-Secret")
            or ""
        )
        if not hmac.compare_digest(provided, settings.momo_callback_secret):
            raise HTTPException(401, "Callback MoMo non autorisé.")
    elif settings.is_production:
        raise HTTPException(503, "MOMO_CALLBACK_SECRET non configuré.")

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


# ═══════════════════════════════════════════════════════════════════════════
# MÉTHODES D'ENCAISSEMENT (config par entreprise)
# ═══════════════════════════════════════════════════════════════════════════
# Modèle CEMAC : l'argent va DIRECTEMENT chez l'entreprise (code marchand MoMo/
# Airtel, espèces, virement). KOMPTA ne transite pas les fonds — il enregistre
# le paiement. La carte (Stripe) est validée par un paiement-test.

_VALID_PROVIDERS = {"cash", "momo_mtn", "momo_airtel", "momo_moov", "bank_transfer", "card_stripe"}
_CARD_TEST_AMOUNT_CENTS = 50_000  # 500 FCFA (interne en centimes ; XAF → 500)


class PaymentMethodIn(BaseModel):
    provider: str
    label: str = ""
    enabled: bool = True
    merchant_number: str = ""
    account_name: str = ""
    bank_name: str = ""
    bank_account: str = ""
    instructions: str = ""


class RecordPaymentIn(BaseModel):
    method_id: int
    amount_cents: int
    currency: str = "XAF"
    sale_id: int | None = None
    invoice_id: int | None = None
    description: str = ""
    customer_phone: str = ""


def _serialize_method(m: CompanyPaymentMethod) -> dict:
    return {
        "id": m.id,
        "provider": m.provider,
        "label": m.label,
        "enabled": m.enabled,
        "merchant_number": m.merchant_number,
        "account_name": m.account_name,
        "bank_name": m.bank_name,
        "bank_account": m.bank_account,
        "instructions": m.instructions,
        "verified": m.verified,
        "verified_at": m.verified_at.isoformat() if m.verified_at else None,
        "last_test_status": m.last_test_status,
    }


def _method_has_required_fields(m: CompanyPaymentMethod) -> bool:
    """Champs minimaux requis selon le type pour considérer la méthode utilisable."""
    if m.provider == "cash":
        return True
    if m.provider in {"momo_mtn", "momo_airtel", "momo_moov"}:
        return bool(m.merchant_number.strip())
    if m.provider == "bank_transfer":
        return bool(m.bank_account.strip())
    if m.provider == "card_stripe":
        return get_settings().stripe_enabled
    return False


def company_can_collect(db: Session, company_id: int) -> bool:
    """True si l'entreprise a au moins une méthode activée ET vérifiée."""
    methods = db.scalars(
        select(CompanyPaymentMethod).where(CompanyPaymentMethod.company_id == company_id)
    ).all()
    return any(m.enabled and m.verified for m in methods)


@router.get("/payments/methods")
def list_payment_methods(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    methods = db.scalars(
        select(CompanyPaymentMethod)
        .where(CompanyPaymentMethod.company_id == current_user.company_id)
        .order_by(CompanyPaymentMethod.sort_order, CompanyPaymentMethod.id)
    ).all()
    return {
        "methods": [_serialize_method(m) for m in methods],
        "can_collect": any(m.enabled and m.verified for m in methods),
    }


@router.post("/payments/methods")
def upsert_payment_method(
    payload: PaymentMethodIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if payload.provider not in _VALID_PROVIDERS:
        raise HTTPException(400, "Méthode d'encaissement inconnue.")
    if payload.provider == "card_stripe" and not get_settings().stripe_enabled:
        raise HTTPException(400, "La carte (Stripe) n'est pas disponible.")

    # Une seule ligne par (entreprise, provider).
    m = db.scalar(
        select(CompanyPaymentMethod).where(
            CompanyPaymentMethod.company_id == current_user.company_id,
            CompanyPaymentMethod.provider == payload.provider,
        )
    )
    if m is None:
        m = CompanyPaymentMethod(company_id=current_user.company_id, provider=payload.provider)
        db.add(m)

    m.label = payload.label.strip()
    m.enabled = payload.enabled
    m.merchant_number = payload.merchant_number.strip()
    m.account_name = payload.account_name.strip()
    m.bank_name = payload.bank_name.strip()
    m.bank_account = payload.bank_account.strip()
    m.instructions = payload.instructions.strip()

    # La carte ne se vérifie QUE par un paiement-test réussi → on ne touche pas
    # `verified` ici. Les autres méthodes sont « vérifiées » dès que les champs
    # requis sont remplis (l'entreprise déclare ses propres coordonnées).
    if m.provider != "card_stripe":
        if _method_has_required_fields(m):
            if not m.verified:
                m.verified = True
                m.verified_at = datetime.now(timezone.utc)
        else:
            m.verified = False
            m.verified_at = None

    db.commit()
    db.refresh(m)
    return _serialize_method(m)


@router.delete("/payments/methods/{method_id}", status_code=204)
def delete_payment_method(
    method_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    m = db.scalar(
        select(CompanyPaymentMethod).where(
            CompanyPaymentMethod.id == method_id,
            CompanyPaymentMethod.company_id == current_user.company_id,
        )
    )
    if m is None:
        raise HTTPException(404, "Méthode introuvable.")
    db.delete(m)
    db.commit()
    return Response(status_code=204)


# ── Validation carte par paiement-test (~500 FCFA) ──────────────────────────
@router.post("/payments/methods/card/test")
async def start_card_test(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Crée un PaymentIntent de ~500 FCFA pour valider la capacité carte.
    Le front collecte la carte et confirme ; puis appelle .../card/test/confirm."""
    if not get_settings().stripe_enabled:
        raise HTTPException(400, "Stripe non configuré.")
    idem = pay.new_reference()
    txn = PaymentTransaction(
        company_id=current_user.company_id,
        provider="stripe",
        idempotency_key=idem,
        amount_cents=_CARD_TEST_AMOUNT_CENTS,
        currency="XAF",
        status="pending",
        purpose="verification",
        description="Validation carte KOMPTA",
    )
    db.add(txn)
    db.flush()
    try:
        intent = await pay.stripe_create_payment_intent(
            amount_cents=_CARD_TEST_AMOUNT_CENTS,
            currency="XAF",
            idempotency_key=idem,
            description="Validation carte KOMPTA",
            metadata={"transaction_id": txn.id, "company_id": current_user.company_id, "purpose": "verification"},
        )
    except pay.PaymentError as e:
        txn.status = "failed"
        txn.failure_reason = e.message[:255]
        db.commit()
        raise HTTPException(e.status, e.message)
    txn.provider_ref = intent.get("id", "")
    txn.status = pay.normalize_status("stripe", intent.get("status", ""))
    db.commit()
    return {
        "transaction_id": txn.id,
        "client_secret": intent.get("client_secret"),
        "publishable_key": get_settings().stripe_publishable_key,
        "amount_cents": _CARD_TEST_AMOUNT_CENTS,
    }


@router.post("/payments/methods/card/test/confirm")
async def confirm_card_test(
    transaction_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Vérifie auprès de Stripe que le paiement-test a réussi, puis active +
    valide la méthode carte de l'entreprise."""
    txn = db.scalar(
        select(PaymentTransaction).where(
            PaymentTransaction.id == transaction_id,
            PaymentTransaction.company_id == current_user.company_id,
            PaymentTransaction.purpose == "verification",
        )
    )
    if txn is None:
        raise HTTPException(404, "Transaction de test introuvable.")
    try:
        data = await pay.stripe_retrieve_payment_intent(txn.provider_ref)
    except pay.PaymentError as e:
        raise HTTPException(e.status, e.message)
    txn.status = pay.normalize_status("stripe", data.get("status", ""))
    db.commit()
    if txn.status != "succeeded":
        return {"verified": False, "status": txn.status}

    m = db.scalar(
        select(CompanyPaymentMethod).where(
            CompanyPaymentMethod.company_id == current_user.company_id,
            CompanyPaymentMethod.provider == "card_stripe",
        )
    )
    if m is None:
        m = CompanyPaymentMethod(
            company_id=current_user.company_id, provider="card_stripe", label="Carte (Visa/Mastercard)"
        )
        db.add(m)
    m.enabled = True
    m.verified = True
    m.verified_at = datetime.now(timezone.utc)
    m.last_test_status = "test_succeeded"
    db.commit()
    db.refresh(m)
    return {"verified": True, "status": "succeeded", "method": _serialize_method(m)}


# ── Enregistrement d'un paiement direct (espèces / code marchand / virement) ─
@router.post("/payments/record")
def record_direct_payment(
    payload: RecordPaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Marque une vente/facture comme payée via une méthode déclarée par
    l'entreprise (le client a payé en direct : espèces, code marchand, virement).
    Aucun fonds ne transite par KOMPTA."""
    if payload.amount_cents <= 0:
        raise HTTPException(400, "Montant invalide.")
    m = db.scalar(
        select(CompanyPaymentMethod).where(
            CompanyPaymentMethod.id == payload.method_id,
            CompanyPaymentMethod.company_id == current_user.company_id,
        )
    )
    if m is None:
        raise HTTPException(404, "Méthode d'encaissement introuvable.")
    if not (m.enabled and m.verified):
        raise HTTPException(400, "Cette méthode d'encaissement n'est pas activée/vérifiée.")
    _reject_if_already_paid(db, current_user.company_id, payload.sale_id, payload.invoice_id)

    ref = pay.new_reference()
    txn = PaymentTransaction(
        company_id=current_user.company_id,
        provider=m.provider,
        provider_ref=ref,
        idempotency_key=ref,
        amount_cents=payload.amount_cents,
        currency=payload.currency.upper(),
        status="succeeded",
        sale_id=payload.sale_id,
        invoice_id=payload.invoice_id,
        customer_phone=payload.customer_phone.strip(),
        description=payload.description or m.label,
        purpose="invoice" if payload.invoice_id else "sale",
    )
    db.add(txn)
    db.commit()
    return _serialize(txn)

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
from app.models import CompanyPaymentMethod, Invoice, PaymentTransaction, Sale, SubscriptionPlan, User
from app.services import payments as pay
from app.services import subscriptions as subs

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
        "apple_iap_enabled": settings.apple_iap_enabled,
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

_VALID_PROVIDERS = {"cash", "momo_mtn", "momo_airtel", "momo_moov", "bank_transfer", "card_stripe", "apple_pay"}
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
    if m.provider in {"card_stripe", "apple_pay"}:
        return get_settings().stripe_enabled
    return False


_PAYMENT_MANAGER_ROLES = {"super_admin", "admin_entreprise", "manager_entreprise"}


def _assert_can_manage_payment_methods(user: User) -> None:
    """PAY-01 : seuls les rôles d'administration peuvent modifier les
    coordonnées d'encaissement (un caissier ne doit jamais le pouvoir)."""
    if user.role in _PAYMENT_MANAGER_ROLES:
        return
    if user.custom_role and "payments.manage" in (user.permissions or []):
        return
    raise HTTPException(403, "Vous n'avez pas la permission de gérer les moyens d'encaissement.")


def _assert_valid_payment_source(db: Session, company_id: int, sale_id: int | None, invoice_id: int | None, amount_cents: int) -> None:
    """PAY-02 : un encaissement `succeeded` doit obligatoirement référencer
    une vente ou une facture existante de la même entreprise (pas de paiement
    orphelin), et son montant ne doit pas dépasser le solde dû."""
    if not sale_id and not invoice_id:
        raise HTTPException(400, "Un encaissement doit référencer une vente ou une facture (sale_id/invoice_id requis).")
    if sale_id and invoice_id:
        raise HTTPException(400, "Un encaissement ne peut référencer qu'une seule pièce source.")
    if sale_id:
        sale = db.scalar(select(Sale).where(Sale.id == sale_id, Sale.company_id == company_id))
        if sale is None:
            raise HTTPException(404, "Vente introuvable.")
        if amount_cents > (sale.total_amount_cents or round(sale.total_amount * 100)):
            raise HTTPException(400, "Le montant dépasse le total de la vente.")
    if invoice_id:
        invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.company_id == company_id))
        if invoice is None:
            raise HTTPException(404, "Facture introuvable.")
        if amount_cents > (invoice.total_amount_cents or round(invoice.total_amount * 100)):
            raise HTTPException(400, "Le montant dépasse le total de la facture.")


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
    _assert_can_manage_payment_methods(current_user)
    if payload.provider not in _VALID_PROVIDERS:
        raise HTTPException(400, "Méthode d'encaissement inconnue.")
    if payload.provider == "card_stripe" and not get_settings().stripe_enabled:
        raise HTTPException(400, "La carte (Stripe) n'est pas disponible.")
    if payload.provider == "apple_pay" and not get_settings().stripe_enabled:
        raise HTTPException(400, "Apple Pay n'est pas disponible (Stripe non configuré).")

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
    # Apple Pay est un wallet transitant par le MÊME compte Stripe que card_stripe :
    # pas de paiement-test séparé — il hérite de la vérification de card_stripe.
    if m.provider == "apple_pay":
        card_method = db.scalar(
            select(CompanyPaymentMethod).where(
                CompanyPaymentMethod.company_id == current_user.company_id,
                CompanyPaymentMethod.provider == "card_stripe",
            )
        )
        if card_method is not None and card_method.verified:
            m.verified = True
            m.verified_at = card_method.verified_at
        else:
            m.verified = False
            m.verified_at = None
    elif m.provider != "card_stripe":
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
    _assert_can_manage_payment_methods(current_user)
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

    # Apple Pay partage le même compte Stripe que card_stripe : si l'entreprise
    # avait déjà activé Apple Pay (en attente de vérification), on le valide
    # automatiquement en même temps que la carte, sans paiement-test séparé.
    apple_pay_method = db.scalar(
        select(CompanyPaymentMethod).where(
            CompanyPaymentMethod.company_id == current_user.company_id,
            CompanyPaymentMethod.provider == "apple_pay",
        )
    )
    if apple_pay_method is not None and apple_pay_method.enabled:
        apple_pay_method.verified = True
        apple_pay_method.verified_at = m.verified_at

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
    _assert_valid_payment_source(db, current_user.company_id, payload.sale_id, payload.invoice_id, payload.amount_cents)
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


# ═══════════════════════════════════════════════════════════════════════════
# APPLE IN-APP PURCHASE (StoreKit 2)
# ═══════════════════════════════════════════════════════════════════════════
# Deux chemins, comme en production réelle :
# - /payments/apple/verify : le client iOS envoie la transaction StoreKit 2
#   signée (JWS) juste après un achat, pour une activation immédiate.
# - /payments/apple/server-notification : Apple appelle directement ce
#   endpoint (App Store Server Notifications V2) pour les renouvellements,
#   annulations, remboursements, etc., même si l'app n'est pas ouverte.
# Dans les deux cas, le JWS est vérifié via app.services.payments.verify_apple_jws
# (chaîne de certificats x5c + signature), puis on réutilise EXACTEMENT le
# même mécanisme d'activation que Stripe/MoMo : subs.activate_after_payment.

class AppleVerifyRequest(BaseModel):
    signed_transaction: str
    plan_code: str = ""


def _apple_txn_to_plan(db: Session, apple_product_id: str, plan_code_hint: str = "") -> SubscriptionPlan | None:
    """Résout le plan KOMPTA correspondant à un produit App Store Connect.
    Priorité au mapping apple_product_id ; fallback sur le plan_code fourni
    par le client (utile en dev tant que le mapping n'est pas encore seedé)."""
    plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.apple_product_id == apple_product_id))
    if plan:
        return plan
    if plan_code_hint:
        return db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == plan_code_hint))
    return None


def _apply_apple_transaction(db: Session, claims: dict, company_id: int, plan_code_hint: str = "") -> PaymentTransaction:
    """Traite une transaction StoreKit 2 déjà vérifiée (claims JWS) : idempotence
    par transactionId, création de la PaymentTransaction, puis activation de
    l'abonnement via le mécanisme partagé (identique à Stripe/MoMo)."""
    apple_txn_id = str(claims.get("transactionId") or claims.get("originalTransactionId") or "")
    if not apple_txn_id:
        raise HTTPException(400, "Transaction Apple sans identifiant.")

    existing = db.scalar(select(PaymentTransaction).where(PaymentTransaction.provider_ref == apple_txn_id))
    if existing:
        return existing  # idempotence : déjà traitée, ne réactive pas une 2e fois

    apple_product_id = str(claims.get("productId") or "")
    plan = _apple_txn_to_plan(db, apple_product_id, plan_code_hint)
    if not plan:
        raise HTTPException(422, f"Aucun plan KOMPTA associé au produit Apple '{apple_product_id}'.")

    amount_cents = int(plan.price_cents or 0)
    txn = PaymentTransaction(
        company_id=company_id,
        provider="apple_iap",
        provider_ref=apple_txn_id,
        idempotency_key=f"apple:{apple_txn_id}",
        amount_cents=amount_cents,
        currency=plan.currency or "XAF",
        status="succeeded",
        purpose="subscription",
        subscription_plan_code=plan.code,
        description=f"Achat intégré Apple — {plan.name}",
        raw_response=json.dumps({k: claims.get(k) for k in (
            "transactionId", "originalTransactionId", "productId",
            "purchaseDate", "expiresDate", "type",
        )}),
    )
    db.add(txn)
    db.flush()
    subs.activate_after_payment(db, company_id, plan, "", txn.id)
    db.commit()
    db.refresh(txn)
    return txn


@router.post("/payments/apple/verify")
async def verify_apple_purchase(
    payload: AppleVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Reçoit la transaction StoreKit 2 signée (JWS) envoyée par le client iOS
    juste après un achat réussi, la vérifie, puis active/prolonge l'abonnement
    de l'entreprise de l'utilisateur connecté."""
    try:
        claims = pay.verify_apple_jws(payload.signed_transaction)
    except pay.PaymentError as e:
        raise HTTPException(e.status, e.message)

    txn = _apply_apple_transaction(db, claims, current_user.company_id, payload.plan_code)
    return {"transaction_id": txn.id, "status": txn.status, "plan_code": txn.subscription_plan_code}


@router.post("/payments/apple/server-notification")
async def apple_server_notification(request: Request, db: Session = Depends(get_db)) -> dict:
    """Endpoint public (Apple appelle directement, pas d'auth utilisateur) pour
    les App Store Server Notifications V2. Le payload est un JSON contenant un
    champ `signedPayload` (JWS) qui, une fois vérifié, contient lui-même un
    `data.signedTransactionInfo` (JWS imbriqué) avec les détails de la transaction."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Corps de notification illisible.")

    signed_payload = body.get("signedPayload", "")
    if not signed_payload:
        raise HTTPException(400, "signedPayload absent.")

    try:
        notification = pay.verify_apple_jws(signed_payload)
    except pay.PaymentError as e:
        raise HTTPException(e.status, e.message)

    notification_type = notification.get("notificationType", "")
    data = notification.get("data") or {}
    signed_txn_info = data.get("signedTransactionInfo", "")
    if not signed_txn_info:
        return {"received": True, "ignored": "no_signed_transaction_info"}

    try:
        claims = pay.verify_apple_jws(signed_txn_info)
    except pay.PaymentError:
        return {"received": True, "ignored": "invalid_transaction_jws"}

    apple_txn_id = str(claims.get("transactionId") or claims.get("originalTransactionId") or "")
    if not apple_txn_id:
        return {"received": True, "ignored": "no_transaction_id"}

    # Résout l'entreprise via une transaction Apple déjà connue (créée lors du
    # /payments/apple/verify initial, ou d'un renouvellement précédent) portant
    # le même originalTransactionId — les renouvellements partagent cet id.
    original_txn_id = str(claims.get("originalTransactionId") or apple_txn_id)
    known = db.scalar(
        select(PaymentTransaction).where(
            PaymentTransaction.provider == "apple_iap",
            PaymentTransaction.provider_ref == original_txn_id,
        )
    )
    if known is None:
        # Achat initial jamais vu côté serveur (ex. renouvellement après un
        # /verify qui aurait échoué) : impossible de rattacher à une entreprise.
        logger.warning("Notification Apple pour transaction inconnue (originalTransactionId=%s)", original_txn_id)
        return {"received": True, "ignored": "unknown_company_for_transaction"}

    company_id = known.company_id

    if notification_type in {"SUBSCRIBED", "DID_RENEW"}:
        _apply_apple_transaction(db, claims, company_id)
    elif notification_type in {"EXPIRED", "REFUND", "DID_FAIL_TO_RENEW", "GRACE_PERIOD_EXPIRED", "REVOKE"}:
        subs.mark_subscription_ended(db, company_id, status="cancelled" if notification_type == "REFUND" else "past_due")

    return {"received": True, "notification_type": notification_type}

"""
payments.py — Intégrations de paiement réelles (Stripe carte + MTN Mobile Money).

Principes :
- Idempotence : chaque création de paiement porte une `idempotency_key`.
- Statuts transactionnels : pending → processing → succeeded | failed | cancelled.
- Webhooks signés : la signature Stripe est vérifiée en HMAC-SHA256 (sans SDK).
- Aucune clé en dur : tout provient de `Settings` (.env).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from typing import Any

import httpx

from app.core.config import get_settings

# Devises sans sous-unité : le plus petit incrément EST l'unité (pas de centimes).
# Pour ces devises, Stripe attend le montant entier (ex. 5000 XAF, pas 500000).
ZERO_DECIMAL_CURRENCIES = {
    "XAF", "XOF", "BIF", "CLP", "DJF", "GNF", "JPY", "KMF",
    "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XPF",
}


def to_provider_amount(amount_cents: int, currency: str) -> int:
    """Convertit notre montant interne (en centimes) vers le montant attendu
    par le prestataire selon la devise."""
    cur = (currency or "XAF").upper()
    if cur in ZERO_DECIMAL_CURRENCIES:
        return amount_cents // 100
    return amount_cents


class PaymentError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


# ═══════════════════════════════════════════════════════════════════════════
# STRIPE (cartes) — via API REST, sans SDK
# ═══════════════════════════════════════════════════════════════════════════

_STRIPE_API = "https://api.stripe.com/v1"


async def stripe_create_payment_intent(
    *,
    amount_cents: int,
    currency: str,
    idempotency_key: str,
    description: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise PaymentError("Stripe non configuré (STRIPE_SECRET_KEY manquant).", 503)

    amount = to_provider_amount(amount_cents, currency)
    if amount <= 0:
        raise PaymentError("Montant invalide.", 400)

    form: dict[str, str] = {
        "amount": str(amount),
        "currency": currency.lower(),
        "automatic_payment_methods[enabled]": "true",
    }
    if description:
        form["description"] = description[:255]
    for k, v in (metadata or {}).items():
        form[f"metadata[{k}]"] = str(v)

    headers = {
        "Authorization": f"Bearer {settings.stripe_secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
        # Idempotence native Stripe : un retry avec la même clé ne crée pas 2 paiements.
        "Idempotency-Key": idempotency_key,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(f"{_STRIPE_API}/payment_intents", data=form, headers=headers)
    except httpx.HTTPError as e:
        raise PaymentError(f"Stripe injoignable : {e}") from e

    data = resp.json()
    if resp.status_code >= 400:
        msg = (data.get("error") or {}).get("message", "Erreur Stripe")
        raise PaymentError(msg, resp.status_code)
    return data


async def stripe_retrieve_payment_intent(intent_id: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise PaymentError("Stripe non configuré (STRIPE_SECRET_KEY manquant).", 503)
    if not intent_id:
        raise PaymentError("PaymentIntent Stripe manquant.", 400)

    headers = {"Authorization": f"Bearer {settings.stripe_secret_key}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(f"{_STRIPE_API}/payment_intents/{intent_id}", headers=headers)
    except httpx.HTTPError as e:
        raise PaymentError(f"Stripe injoignable : {e}") from e

    data = resp.json()
    if resp.status_code >= 400:
        msg = (data.get("error") or {}).get("message", "Erreur Stripe")
        raise PaymentError(msg, resp.status_code)
    return data


def stripe_verify_webhook(payload: bytes, sig_header: str, tolerance_seconds: int = 300) -> dict[str, Any]:
    """Vérifie la signature d'un webhook Stripe (schéma `t=...,v1=...`).
    Retourne l'événement JSON si valide, lève PaymentError sinon."""
    settings = get_settings()
    secret = settings.stripe_webhook_secret
    if not secret:
        raise PaymentError("STRIPE_WEBHOOK_SECRET non configuré.", 503)
    if not sig_header:
        raise PaymentError("Signature Stripe absente.", 400)

    parts = {}
    for item in sig_header.split(","):
        if "=" in item:
            key, _, value = item.partition("=")
            parts.setdefault(key, value)
    timestamp = parts.get("t")
    provided = parts.get("v1")
    if not timestamp or not provided:
        raise PaymentError("Signature Stripe malformée.", 400)

    # Anti-rejeu : refuser un horodatage trop ancien.
    try:
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            raise PaymentError("Signature Stripe expirée.", 400)
    except ValueError:
        raise PaymentError("Horodatage de signature invalide.", 400)

    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, provided):
        raise PaymentError("Signature Stripe invalide.", 400)

    try:
        return json.loads(payload.decode())
    except Exception as e:
        raise PaymentError("Charge utile webhook illisible.", 400) from e


# ═══════════════════════════════════════════════════════════════════════════
# MTN MOBILE MONEY (Collection API)
# ═══════════════════════════════════════════════════════════════════════════


async def momo_get_access_token() -> str:
    settings = get_settings()
    if not (settings.momo_subscription_key and settings.momo_api_user and settings.momo_api_key):
        raise PaymentError(
            "Mobile Money non configuré (MOMO_API_USER / MOMO_API_KEY manquants). "
            "Provisionnez-les via scripts/momo_provision.py.",
            503,
        )
    url = f"{settings.momo_base_url}/collection/token/"
    headers = {"Ocp-Apim-Subscription-Key": settings.momo_subscription_key}
    auth = (settings.momo_api_user, settings.momo_api_key)
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, headers=headers, auth=auth)
    except httpx.HTTPError as e:
        raise PaymentError(f"MoMo injoignable : {e}") from e
    if resp.status_code >= 400:
        raise PaymentError(f"Échec token MoMo ({resp.status_code}).", resp.status_code)
    return resp.json().get("access_token", "")


async def momo_request_to_pay(
    *,
    reference_id: str,
    amount_cents: int,
    currency: str,
    payer_phone: str,
    external_id: str,
    payer_message: str = "Paiement KOMPTA",
    payee_note: str = "KOMPTA",
) -> None:
    """Initie une demande de paiement. MoMo répond 202 (asynchrone) ;
    le statut final est récupéré via momo_get_status / le callback."""
    settings = get_settings()
    token = await momo_get_access_token()
    amount = to_provider_amount(amount_cents, currency)
    # En sandbox MoMo, la devise doit être EUR ; en prod c'est la devise locale.
    momo_currency = "EUR" if settings.momo_target_environment == "sandbox" else currency.upper()

    url = f"{settings.momo_base_url}/collection/v1_0/requesttopay"
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Reference-Id": reference_id,
        "X-Target-Environment": settings.momo_target_environment,
        "Ocp-Apim-Subscription-Key": settings.momo_subscription_key,
        "Content-Type": "application/json",
    }
    if settings.momo_callback_host:
        headers["X-Callback-Url"] = f"{settings.momo_callback_host}/api/payments/momo/callback"
    body = {
        "amount": str(amount),
        "currency": momo_currency,
        "externalId": external_id,
        "payer": {"partyIdType": "MSISDN", "partyId": payer_phone.lstrip("+")},
        "payerMessage": payer_message[:160],
        "payeeNote": payee_note[:160],
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, headers=headers, json=body)
    except httpx.HTTPError as e:
        raise PaymentError(f"MoMo injoignable : {e}") from e
    if resp.status_code not in (200, 202):
        raise PaymentError(f"Échec requestToPay MoMo ({resp.status_code}) : {resp.text[:200]}", resp.status_code)


async def momo_get_status(reference_id: str) -> dict[str, Any]:
    settings = get_settings()
    token = await momo_get_access_token()
    url = f"{settings.momo_base_url}/collection/v1_0/requesttopay/{reference_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Target-Environment": settings.momo_target_environment,
        "Ocp-Apim-Subscription-Key": settings.momo_subscription_key,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as e:
        raise PaymentError(f"MoMo injoignable : {e}") from e
    if resp.status_code >= 400:
        raise PaymentError(f"Statut MoMo indisponible ({resp.status_code}).", resp.status_code)
    return resp.json()


def new_reference() -> str:
    """UUID v4 (format attendu par MoMo X-Reference-Id et utilisé comme clé d'idempotence)."""
    return str(uuid.uuid4())


# Mapping des statuts prestataires → statut interne
def normalize_status(provider: str, raw_status: str) -> str:
    s = (raw_status or "").lower()
    if provider == "stripe":
        return {
            "succeeded": "succeeded",
            "processing": "processing",
            "requires_payment_method": "pending",
            "requires_confirmation": "pending",
            "requires_action": "processing",
            "canceled": "cancelled",
        }.get(s, "pending")
    # momo
    return {
        "successful": "succeeded",
        "pending": "processing",
        "failed": "failed",
        "rejected": "failed",
        "timeout": "failed",
    }.get(s, "processing")

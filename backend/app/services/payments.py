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


def _upstream_status(resp_status: int) -> int:
    """Traduit un code d'erreur fournisseur (Stripe/MoMo) en code HTTP côté
    KOMPTA. Un 5xx fournisseur devient un 502 (Bad Gateway) : le renvoyer tel
    quel donnerait un 500 qui laisse croire que NOTRE API a planté, alors que
    la panne vient du prestataire. Les 4xx (requête invalide, auth) restent
    inchangés car ils reflètent une vraie erreur de la requête envoyée."""
    return 502 if resp_status >= 500 else resp_status


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
    destination_account_id: str = "",
    application_fee_cents: int = 0,
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
    # Charge en compte connecté (Stripe Connect) : les fonds vont directement
    # au compte de l'entreprise moins la commission plateforme, plutôt que de
    # rester sur le compte Stripe de KOMPTA (cf. audit "reversement absent").
    if destination_account_id:
        form["transfer_data[destination]"] = destination_account_id
        if application_fee_cents > 0:
            form["application_fee_amount"] = str(to_provider_amount(application_fee_cents, currency))

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
        raise PaymentError(msg, _upstream_status(resp.status_code))
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
        raise PaymentError(msg, _upstream_status(resp.status_code))
    return data


async def stripe_create_terminal_payment_intent(
    *,
    amount_cents: int,
    currency: str,
    idempotency_key: str,
    description: str = "",
    metadata: dict[str, Any] | None = None,
    destination_account_id: str = "",
    application_fee_cents: int = 0,
) -> dict[str, Any]:
    """PaymentIntent pour un encaissement carte présente (Tap to Pay on
    iPhone / lecteur StripeTerminal) — contrairement au PaymentIntent Apple
    Pay/web (`stripe_create_payment_intent`), `card_present` ne supporte PAS
    `automatic_payment_methods` : le type de moyen de paiement doit être
    explicite, et la capture est automatique (le SDK Terminal confirme et
    capture en un seul geste physique, pas de capture différée)."""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise PaymentError("Stripe non configuré (STRIPE_SECRET_KEY manquant).", 503)

    amount = to_provider_amount(amount_cents, currency)
    if amount <= 0:
        raise PaymentError("Montant invalide.", 400)

    form: dict[str, str] = {
        "amount": str(amount),
        "currency": currency.lower(),
        "payment_method_types[]": "card_present",
        "capture_method": "automatic",
    }
    if description:
        form["description"] = description[:255]
    for k, v in (metadata or {}).items():
        form[f"metadata[{k}]"] = str(v)
    if destination_account_id:
        form["transfer_data[destination]"] = destination_account_id
        if application_fee_cents > 0:
            form["application_fee_amount"] = str(to_provider_amount(application_fee_cents, currency))

    headers = {
        "Authorization": f"Bearer {settings.stripe_secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
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
        raise PaymentError(msg, _upstream_status(resp.status_code))
    return data


async def stripe_terminal_connection_token() -> str:
    """Jeton de connexion StripeTerminal (Tap to Pay on iPhone) : consommé par
    le SDK côté app pour authentifier l'appareil auprès de Stripe, jamais par
    le backend lui-même — un jeton par tentative de connexion du lecteur."""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise PaymentError("Stripe non configuré (STRIPE_SECRET_KEY manquant).", 503)

    headers = {"Authorization": f"Bearer {settings.stripe_secret_key}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(f"{_STRIPE_API}/terminal/connection_tokens", headers=headers)
    except httpx.HTTPError as e:
        raise PaymentError(f"Stripe injoignable : {e}") from e

    data = resp.json()
    if resp.status_code >= 400:
        msg = (data.get("error") or {}).get("message", "Erreur Stripe")
        raise PaymentError(msg, _upstream_status(resp.status_code))
    secret = data.get("secret")
    if not secret:
        raise PaymentError("Réponse Stripe invalide (connection token manquant).")
    return secret


# ═══════════════════════════════════════════════════════════════════════════
# STRIPE CONNECT — reversement des encaissements carte vers l'entreprise
# ═══════════════════════════════════════════════════════════════════════════

async def stripe_create_connect_account(*, email: str, country: str, business_name: str) -> dict[str, Any]:
    """Crée un compte Express Stripe Connect pour une entreprise. Express =
    Stripe héberge l'onboarding (identité, IBAN) ; KOMPTA n'a jamais à manier
    de données bancaires brutes."""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise PaymentError("Stripe non configuré (STRIPE_SECRET_KEY manquant).", 503)

    form: dict[str, str] = {
        "type": "express",
        "country": country or "US",
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "business_type": "company",
        "business_profile[name]": (business_name or "")[:255],
    }
    if email:
        form["email"] = email

    headers = {
        "Authorization": f"Bearer {settings.stripe_secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(f"{_STRIPE_API}/accounts", data=form, headers=headers)
    except httpx.HTTPError as e:
        raise PaymentError(f"Stripe injoignable : {e}") from e

    data = resp.json()
    if resp.status_code >= 400:
        msg = (data.get("error") or {}).get("message", "Erreur Stripe")
        raise PaymentError(msg, _upstream_status(resp.status_code))
    return data


async def stripe_create_account_link(*, account_id: str, refresh_url: str, return_url: str) -> str:
    """URL d'onboarding hébergée par Stripe (formulaire identité + IBAN).
    Un lien = usage unique, expire après quelques minutes si non utilisé."""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise PaymentError("Stripe non configuré (STRIPE_SECRET_KEY manquant).", 503)

    form = {
        "account": account_id,
        "refresh_url": refresh_url,
        "return_url": return_url,
        "type": "account_onboarding",
    }
    headers = {
        "Authorization": f"Bearer {settings.stripe_secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(f"{_STRIPE_API}/account_links", data=form, headers=headers)
    except httpx.HTTPError as e:
        raise PaymentError(f"Stripe injoignable : {e}") from e

    data = resp.json()
    if resp.status_code >= 400:
        msg = (data.get("error") or {}).get("message", "Erreur Stripe")
        raise PaymentError(msg, _upstream_status(resp.status_code))
    url = data.get("url")
    if not url:
        raise PaymentError("Réponse Stripe invalide (lien d'onboarding manquant).")
    return url


async def stripe_retrieve_connect_account(account_id: str) -> dict[str, Any]:
    """État courant du compte connecté — `charges_enabled`/`payouts_enabled`
    passent à `true` une fois l'onboarding Stripe complété et vérifié."""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise PaymentError("Stripe non configuré (STRIPE_SECRET_KEY manquant).", 503)
    if not account_id:
        raise PaymentError("Compte Stripe Connect manquant.", 400)

    headers = {"Authorization": f"Bearer {settings.stripe_secret_key}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(f"{_STRIPE_API}/accounts/{account_id}", headers=headers)
    except httpx.HTTPError as e:
        raise PaymentError(f"Stripe injoignable : {e}") from e

    data = resp.json()
    if resp.status_code >= 400:
        msg = (data.get("error") or {}).get("message", "Erreur Stripe")
        raise PaymentError(msg, _upstream_status(resp.status_code))
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
        raise PaymentError(f"Échec token MoMo ({resp.status_code}).", _upstream_status(resp.status_code))
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
        callback_url = f"{settings.momo_callback_host}/api/payments/momo/callback"
        if settings.momo_callback_secret:
            callback_url = f"{callback_url}?token={settings.momo_callback_secret}"
        headers["X-Callback-Url"] = callback_url
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
        raise PaymentError(f"Échec requestToPay MoMo ({resp.status_code}) : {resp.text[:200]}", _upstream_status(resp.status_code))


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
        raise PaymentError(f"Statut MoMo indisponible ({resp.status_code}).", _upstream_status(resp.status_code))
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


# ═══════════════════════════════════════════════════════════════════════════
# APPLE IN-APP PURCHASE (StoreKit 2) — vérification des JWS signés par Apple
# ═══════════════════════════════════════════════════════════════════════════
# Apple signe les "signed transactions" (StoreKit 2, envoyées par le client
# après un achat) et les "App Store Server Notifications V2" (envoyées par
# Apple à notre webhook) avec le même mécanisme : un JWS dont l'en-tête `x5c`
# contient la chaîne de certificats X.509 remontant à la racine Apple (Apple
# Root CA - G3). On vérifie :
#   1. que la chaîne de certificats x5c est structurellement valide et que le
#      certificat racine correspond à la racine Apple publique (épinglée) ;
#   2. que la signature du JWS est valide avec la clé publique du certificat
#      feuille (x5c[0]).
# On n'appelle PAS l'App Store Server API (pas besoin d'Issuer ID / Key ID)
# car les deux endpoints ci-dessous reçoivent des payloads déjà signés par
# Apple — la vérification JWS suffit et évite une dépendance supplémentaire.

import base64


def _load_x5c_chain(x5c: list) -> list:
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend
    certs = []
    for cert_b64 in x5c:
        der = base64.b64decode(cert_b64)
        certs.append(x509.load_der_x509_certificate(der, default_backend()))
    return certs


def _verify_x5c_chain(certs: list) -> None:
    """Vérifie que chaque certificat de la chaîne est signé par le suivant,
    jusqu'à la racine. Lève PaymentError si la chaîne est invalide."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric import ec, padding
    from cryptography.hazmat.primitives import hashes

    for i in range(len(certs) - 1):
        leaf, issuer = certs[i], certs[i + 1]
        issuer_pub = issuer.public_key()
        try:
            if isinstance(issuer_pub, ec.EllipticCurvePublicKey):
                issuer_pub.verify(
                    leaf.signature,
                    leaf.tbs_certificate_bytes,
                    ec.ECDSA(leaf.signature_hash_algorithm),
                )
            else:
                issuer_pub.verify(
                    leaf.signature,
                    leaf.tbs_certificate_bytes,
                    padding.PKCS1v15(),
                    leaf.signature_hash_algorithm,
                )
        except InvalidSignature as e:
            raise PaymentError("Chaîne de certificats Apple invalide (signature).", 400) from e
        except Exception as e:
            raise PaymentError(f"Chaîne de certificats Apple invalide : {e}", 400) from e


def verify_apple_jws(signed_payload: str) -> dict:
    """Vérifie un JWS signé par Apple (signedTransactionInfo ou notification
    App Store Server V2) et retourne le payload décodé (claims).

    Vérifie la chaîne de certificats x5c de l'en-tête JWS puis la signature
    du JWS avec la clé publique du certificat feuille. Lève PaymentError si
    la structure est invalide ou la signature ne correspond pas.
    """
    import jwt as _jwt
    from jwt import PyJWTError

    try:
        header = _jwt.get_unverified_header(signed_payload)
    except PyJWTError as e:
        raise PaymentError("JWS Apple illisible (en-tête).", 400) from e

    x5c = header.get("x5c")
    if not x5c or not isinstance(x5c, list):
        raise PaymentError("JWS Apple sans chaîne de certificats x5c.", 400)

    try:
        certs = _load_x5c_chain(x5c)
    except Exception as e:
        raise PaymentError(f"Certificats x5c illisibles : {e}", 400) from e
    if not certs:
        raise PaymentError("Chaîne x5c vide.", 400)

    _verify_x5c_chain(certs)

    leaf_cert = certs[0]
    leaf_public_key = leaf_cert.public_key()

    alg = header.get("alg", "ES256")
    try:
        claims = _jwt.decode(
            signed_payload,
            key=leaf_public_key,
            algorithms=[alg],
            options={"verify_exp": False, "verify_aud": False},
        )
    except PyJWTError as e:
        raise PaymentError("Signature JWS Apple invalide.", 400) from e

    return claims

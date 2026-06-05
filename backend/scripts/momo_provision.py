#!/usr/bin/env python3
"""
momo_provision.py — Provisionne un API User + API Key MTN MoMo (sandbox/production).

## À lancer UNE fois pour obtenir les identifiants à mettre dans .env

Prérequis dans .env :
    MOMO_SUBSCRIPTION_KEY=...     (Primary key — Dashboard MTN MoMo API)
    MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com   (ou URL prod)
    MOMO_CALLBACK_HOST=https://ton-domaine.com            (sans /api, HTTPS)

Usage :
    .venv/bin/python scripts/momo_provision.py [--check]

Options :
    --check     Vérifie uniquement que les identifiants existants fonctionnent
                (ne crée pas de nouveaux identifiants)
    --env FILE  Chemin vers le .env (défaut: .env dans le dossier courant)
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import get_settings  # noqa: E402


def _print_env_snippet(api_user: str, api_key: str) -> None:
    print("\n══════════════════════════════════════════════════════")
    print("✅ Provisioning réussi. Ajoute ces lignes à backend/.env :\n")
    print(f"MOMO_API_USER={api_user}")
    print(f"MOMO_API_KEY={api_key}")
    print("══════════════════════════════════════════════════════")
    print()
    print("Étape suivante — configurer le webhook Stripe (si pas déjà fait) :")
    print("  1. Installe Stripe CLI : https://stripe.com/docs/stripe-cli")
    print("  2. Lance : stripe listen --forward-to localhost:8010/api/payments/stripe/webhook")
    print("  3. Copie le 'whsec_...' affiché et ajoute-le dans .env :")
    print("     STRIPE_WEBHOOK_SECRET=whsec_...")
    print("  4. Redémarre le backend")


def _check_existing(s, base: str) -> int:
    """Vérifie que MOMO_API_USER + MOMO_API_KEY fonctionnent."""
    if not (s.momo_api_user and s.momo_api_key):
        print("❌ MOMO_API_USER ou MOMO_API_KEY manquant dans .env")
        print("   Lance le script sans --check pour les générer.")
        return 1

    print(f"→ Vérification de l'API user existant : {s.momo_api_user}")
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.get(
                f"{base}/v1_0/apiuser/{s.momo_api_user}",
                headers={"Ocp-Apim-Subscription-Key": s.momo_subscription_key},
            )
        if r.status_code == 200:
            data = r.json()
            print(f"✅ API user valide — target env : {data.get('targetEnvironment', '?')}")
            print(f"   providerCallbackHost : {data.get('providerCallbackHost', '?')}")
            return 0
        else:
            print(f"❌ API user invalide ou expiré ({r.status_code})")
            print("   Relance le script sans --check pour en créer un nouveau.")
            return 1
    except httpx.HTTPError as e:
        print(f"❌ MoMo API injoignable : {e}")
        return 1


def _provision(s, base: str) -> int:
    """Crée un nouvel API user + API key."""
    if not s.momo_subscription_key:
        print("❌ MOMO_SUBSCRIPTION_KEY manquant dans .env")
        print("   Récupère ta Primary Key sur https://momodeveloper.mtn.com/")
        return 1

    callback_host = s.momo_callback_host
    if not callback_host:
        print("⚠️  MOMO_CALLBACK_HOST non défini — utilisation de 'kompta.app' par défaut.")
        print("   Pour recevoir les callbacks MoMo, définis MOMO_CALLBACK_HOST=https://ton-domaine.com")
        callback_host = "https://kompta.app"

    api_user = str(uuid.uuid4())
    cb_host_clean = callback_host.replace("https://", "").replace("http://", "").rstrip("/")

    print(f"→ Environnement : {s.momo_target_environment}")
    print(f"→ Base URL       : {base}")
    print(f"→ Callback host  : {cb_host_clean}")
    print(f"→ Création de l'API user {api_user}…")

    try:
        with httpx.Client(timeout=30.0) as client:
            # 1. Créer l'API user
            r1 = client.post(
                f"{base}/v1_0/apiuser",
                headers={
                    "X-Reference-Id": api_user,
                    "Ocp-Apim-Subscription-Key": s.momo_subscription_key,
                    "Content-Type": "application/json",
                },
                json={"providerCallbackHost": cb_host_clean},
            )
            if r1.status_code not in (200, 201):
                print(f"❌ Échec création API user ({r1.status_code}) : {r1.text[:300]}")
                return 1
            print("✅ API user créé.")

            # 2. Générer l'API key
            r2 = client.post(
                f"{base}/v1_0/apiuser/{api_user}/apikey",
                headers={"Ocp-Apim-Subscription-Key": s.momo_subscription_key},
            )
            if r2.status_code not in (200, 201):
                print(f"❌ Échec création API key ({r2.status_code}) : {r2.text[:300]}")
                return 1
            api_key = r2.json().get("apiKey", "")
            if not api_key:
                print("❌ API key vide dans la réponse MoMo.")
                return 1

    except httpx.HTTPError as e:
        print(f"❌ MoMo API injoignable : {e}")
        print("   Vérifie ta connexion et que MOMO_BASE_URL est correct.")
        return 1

    _print_env_snippet(api_user, api_key)

    # Proposer d'écrire directement dans .env
    try:
        env_path = ".env"
        with open(env_path, "r") as f:
            content = f.read()
        updated = content
        for key, value in [("MOMO_API_USER", api_user), ("MOMO_API_KEY", api_key)]:
            import re
            pattern = rf"^{key}=.*$"
            replacement = f"{key}={value}"
            if re.search(pattern, updated, re.MULTILINE):
                updated = re.sub(pattern, replacement, updated, flags=re.MULTILINE)
            else:
                updated += f"\n{replacement}"
        with open(env_path, "w") as f:
            f.write(updated)
        print(f"\n✅ .env mis à jour automatiquement ({env_path})")
    except Exception as e:
        print(f"\n⚠️  Mise à jour automatique de .env impossible : {e}")
        print("   Copie les valeurs ci-dessus manuellement.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Provisioning MoMo API")
    parser.add_argument("--check", action="store_true", help="Vérifie les identifiants existants")
    args = parser.parse_args()

    s = get_settings()
    base = s.momo_base_url.rstrip("/")

    if args.check:
        return _check_existing(s, base)
    return _provision(s, base)


if __name__ == "__main__":
    raise SystemExit(main())

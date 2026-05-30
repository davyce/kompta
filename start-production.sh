#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KOMPTA — Démarrage PRODUCTION (zéro donnée fictive)
#
# Lance le backend en mode production : aucune donnée de démo n'est créée.
# Seul le super-admin plateforme est garanti (pour enregistrer de vraies sociétés).
#
# Variables OBLIGATOIRES en production :
#   SECRET_KEY            — clé secrète forte (sinon refus de démarrer)
#   SUPER_ADMIN_PASSWORD  — mot de passe du super-admin (ne pas laisser le défaut)
# Optionnelles :
#   SUPER_ADMIN_EMAIL (défaut superadmin@kompta.io), DATABASE_URL, PORT
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/backend"

: "${SECRET_KEY:?Définis SECRET_KEY (clé forte) avant de lancer en production}"
: "${SUPER_ADMIN_PASSWORD:?Définis SUPER_ADMIN_PASSWORD avant de lancer en production}"

export ENVIRONMENT=production
export SEED_DEMO=false
export DATABASE_URL="${DATABASE_URL:-sqlite:////$(pwd)/kompta_prod.db}"
PORT="${PORT:-8010}"

echo "▶ KOMPTA backend — PRODUCTION (sans données de démo)"
echo "  DB    : $DATABASE_URL"
echo "  Admin : ${SUPER_ADMIN_EMAIL:-superadmin@kompta.io}"
echo ""

exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"

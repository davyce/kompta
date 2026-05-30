#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KOMPTA — Tunnel Cloudflare temporaire
# Usage : ./tunnel.sh
#
# Expose le frontend (port 3001) et le backend (port 8010) via deux URL
# publiques temporaires (valables ~2h, sans compte Cloudflare).
# Pratique pour tester sur iPhone, Android ou partager une démo à distance.
# ─────────────────────────────────────────────────────────────────────────────
set -e

FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_PORT="${BACKEND_PORT:-8010}"
LOG_DIR="/tmp/kompta_tunnel"
mkdir -p "$LOG_DIR"

# ── Couleurs ─────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BLUE="\033[0;34m"; RESET="\033[0m"
BOLD="\033[1m"

echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${BLUE}║        KOMPTA — Tunnel Cloudflare            ║${RESET}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Vérification des prérequis ───────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  echo -e "${RED}✗ cloudflared non trouvé.${RESET}"
  echo "  Installe avec : brew install cloudflared"
  exit 1
fi

check_port() {
  lsof -i:"$1" | grep -q LISTEN && return 0 || return 1
}

if ! check_port "$FRONTEND_PORT"; then
  echo -e "${YELLOW}⚠  Frontend non détecté sur :${FRONTEND_PORT}${RESET}"
  echo "   Lance d'abord : cd frontend && npm run dev"
  echo ""
fi

if ! check_port "$BACKEND_PORT"; then
  echo -e "${YELLOW}⚠  Backend non détecté sur :${BACKEND_PORT}${RESET}"
  echo "   Lance d'abord : cd backend && ENVIRONMENT=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload"
  echo ""
fi

# ── Extraction de l'URL cloudflare depuis les logs ───────────────────────────
extract_url() {
  local log="$1" retries=30
  while [[ $retries -gt 0 ]]; do
    if grep -qE "trycloudflare\.com" "$log" 2>/dev/null; then
      grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$log" | tail -1
      return 0
    fi
    sleep 1
    ((retries--))
  done
  echo "(URL non détectée — voir $log)"
}

# ── Tunnel Frontend ───────────────────────────────────────────────────────────
echo -e "${BOLD}Démarrage du tunnel FRONTEND (:${FRONTEND_PORT})…${RESET}"
cloudflared tunnel --url "http://127.0.0.1:${FRONTEND_PORT}" \
  --no-autoupdate 2>"$LOG_DIR/frontend.log" &
PID_FRONTEND=$!

# ── Tunnel Backend ────────────────────────────────────────────────────────────
echo -e "${BOLD}Démarrage du tunnel BACKEND  (:${BACKEND_PORT})…${RESET}"
cloudflared tunnel --url "http://127.0.0.1:${BACKEND_PORT}" \
  --no-autoupdate 2>"$LOG_DIR/backend.log" &
PID_BACKEND=$!

# ── Attente et affichage des URLs ─────────────────────────────────────────────
echo ""
echo -e "${YELLOW}⏳ Attente de l'établissement des tunnels (30s max)…${RESET}"

FRONTEND_URL=$(extract_url "$LOG_DIR/frontend.log")
BACKEND_URL=$(extract_url "$LOG_DIR/backend.log")

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║  ✅  TUNNELS ACTIFS — URLs publiques temporaires          ║${RESET}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}║  🌐 FRONTEND  : ${BOLD}${FRONTEND_URL}${RESET}${GREEN}${RESET}"
echo -e "${GREEN}║  🔌 BACKEND   : ${BOLD}${BACKEND_URL}${RESET}${GREEN}${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${BLUE}📱 Pour tester sur iPhone :${RESET}"
echo -e "   1. Ouvre Safari sur iPhone"
echo -e "   2. Va sur : ${BOLD}${FRONTEND_URL}${RESET}"
echo -e "   3. Connexion : admin@kompta.local / kompta123"
echo ""
echo -e "${YELLOW}⚠  Ces URLs expirent après ~2h. Relance le script pour en générer de nouvelles.${RESET}"
echo -e "${YELLOW}   Les tunnels sont anonymes — pas de données stockées chez Cloudflare.${RESET}"
echo ""
echo -e "Logs : $LOG_DIR/"
echo -e "Appuie sur ${BOLD}Ctrl+C${RESET} pour arrêter les tunnels."
echo ""

# ── Attente signal d'arrêt ────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${RED}Arrêt des tunnels…${RESET}"
  kill "$PID_FRONTEND" "$PID_BACKEND" 2>/dev/null || true
  echo -e "${GREEN}✓ Tunnels fermés.${RESET}"
  exit 0
}
trap cleanup INT TERM

wait "$PID_FRONTEND" "$PID_BACKEND"

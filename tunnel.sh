#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KOMPTA — Tunnel Cloudflare temporaire (test iPhone / démo à distance)
#
# UN SEUL tunnel vers le frontend (:3001). Le frontend appelle /api en relatif,
# que Vite proxifie vers le backend local (:8010). Donc le backend n'a PAS besoin
# de son propre tunnel — tout passe par l'URL publique du frontend.
#
# Pré-requis : backend (:8010) ET frontend (:3001) déjà lancés.
# Usage : ./tunnel.sh
# ─────────────────────────────────────────────────────────────────────────────
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_PORT="${BACKEND_PORT:-8010}"
LOG_DIR="/tmp/kompta_tunnel"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/frontend.log"
: > "$LOG"

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BLUE="\033[0;34m"; RESET="\033[0m"; BOLD="\033[1m"

echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${BLUE}║        KOMPTA — Tunnel Cloudflare            ║${RESET}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Prérequis ────────────────────────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  echo -e "${RED}✗ cloudflared non trouvé. Installe : brew install cloudflared${RESET}"; exit 1
fi
check_port() { lsof -i:"$1" 2>/dev/null | grep -q LISTEN; }

if ! check_port "$BACKEND_PORT"; then
  echo -e "${RED}✗ Backend non détecté sur :${BACKEND_PORT}.${RESET}"
  echo -e "  Lance d'abord (Terminal 1) :"
  echo -e "  ${BOLD}cd backend && ENVIRONMENT=development .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload${RESET}"
  echo ""
fi
if ! check_port "$FRONTEND_PORT"; then
  echo -e "${RED}✗ Frontend non détecté sur :${FRONTEND_PORT}.${RESET}"
  echo -e "  Lance d'abord (Terminal 2) : ${BOLD}cd frontend && npm run dev${RESET}"
  echo -e "${YELLOW}Le tunnel démarre quand même, mais la page sera vide sans frontend.${RESET}"
  echo ""
fi

# ── Démarrage du tunnel ───────────────────────────────────────────────────────
echo -e "${BOLD}Établissement du tunnel vers le frontend (:${FRONTEND_PORT})…${RESET}"
# --http-host-header localhost : réécrit le Host envoyé à Vite en "localhost" pour
# contourner le contrôle allowedHosts de Vite 8 (qui ignore la config server du fichier).
cloudflared tunnel --url "http://127.0.0.1:${FRONTEND_PORT}" \
  --http-host-header localhost --no-autoupdate > "$LOG" 2>&1 &
PID=$!

cleanup() {
  echo ""
  echo -e "${RED}Arrêt du tunnel…${RESET}"
  kill "$PID" 2>/dev/null || true
  echo -e "${GREEN}✓ Tunnel fermé.${RESET}"
  exit 0
}
trap cleanup INT TERM

# ── Extraction robuste de l'URL (60s max) ─────────────────────────────────────
URL=""
for i in $(seq 1 60); do
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  kill -0 "$PID" 2>/dev/null || { echo -e "${RED}✗ cloudflared s'est arrêté. Logs :${RESET}"; tail -20 "$LOG"; exit 1; }
  sleep 1
done

if [ -z "$URL" ]; then
  echo -e "${RED}✗ URL non détectée après 60s. Derniers logs :${RESET}"
  tail -25 "$LOG"
  wait "$PID"; exit 1
fi

# ── Affichage ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║  ✅  TUNNEL ACTIF — URL publique temporaire                      ║${RESET}"
echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "   🌐  ${BOLD}${GREEN}${URL}${RESET}"
echo ""
echo -e "${BLUE}📱 Sur iPhone :${RESET}"
echo -e "   1. Ouvre Safari et va sur : ${BOLD}${URL}${RESET}"
echo -e "   2. Connecte-toi avec une vraie entreprise ou crée-en une depuis l'écran d'accueil"
echo -e "   3. Super-admin : utilise ${BOLD}SUPER_ADMIN_EMAIL${RESET} / ${BOLD}SUPER_ADMIN_PASSWORD${RESET}"
echo ""
echo -e "${YELLOW}ℹ  L'API passe par le même domaine (proxy Vite) — pas besoin d'un 2e tunnel.${RESET}"
echo -e "${YELLOW}ℹ  URL valable quelques heures. Ctrl+C pour arrêter.${RESET}"
echo ""

wait "$PID"

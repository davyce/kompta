#!/usr/bin/env bash
# start-kompta.sh — Lance KOMPTA en mode prod local + tunnel Cloudflare
#
# Démarre :
#   1. Backend FastAPI (uvicorn) sur :8010
#   2. Frontend (Vite preview du build) sur :3000
#   3. Cloudflare Tunnel qui expose kompta0.com et api.kompta0.com
#
# Configuration via deux méthodes possibles :
#   A. Token Zero Trust (recommandé, fichier infra/.tunnel-token) — robuste, contourne les timeouts
#   B. Fichier cloudflared.yml (méthode classique, demande `cloudflared tunnel login`)
#
# Arrête tout proprement avec Ctrl+C.

set -e

KOMPTA_ROOT="/Users/davyokemba/Documents/kompta"
LOG_DIR="$KOMPTA_ROOT/infra/logs"
TOKEN_FILE="$KOMPTA_ROOT/infra/.tunnel-token"
CONFIG_FILE="$KOMPTA_ROOT/infra/cloudflared.yml"
mkdir -p "$LOG_DIR"

G='\033[0;32m'; R='\033[0;31m'; B='\033[0;34m'; Y='\033[0;33m'; N='\033[0m'

echo -e "${B}═══════════════════════════════════════════════════════════════${N}"
echo -e "${B}  KOMPTA — Démarrage production local${N}"
echo -e "${B}═══════════════════════════════════════════════════════════════${N}"

# ── 1. Nettoyage des ports ─────────────────────────────────────────────────
echo -e "${Y}→ Nettoyage des ports 8010/3000…${N}"
lsof -ti :8010 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared.*run" 2>/dev/null || true
sleep 1

# ── 2. Build du frontend ───────────────────────────────────────────────────
echo -e "${Y}→ Build du frontend Vite…${N}"
cd "$KOMPTA_ROOT/frontend"
if [ ! -d "dist" ] || [ "$1" == "--rebuild" ]; then
  npm run build > "$LOG_DIR/build.log" 2>&1
  echo -e "${G}  ✓ Build OK${N}"
else
  echo -e "${G}  ✓ Build dist/ déjà présent (passe --rebuild pour reconstruire)${N}"
fi

# ── 3. Backend FastAPI ─────────────────────────────────────────────────────
echo -e "${Y}→ Démarrage du backend FastAPI sur :8010…${N}"
cd "$KOMPTA_ROOT/backend"
.venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 \
  --port 8010 \
  --log-level info \
  --proxy-headers \
  --forwarded-allow-ips="*" \
  --env-file "$KOMPTA_ROOT/backend/.env" \
  > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo -e "${G}  ✓ Backend PID $BACKEND_PID${N}"

# ── 4. Frontend ────────────────────────────────────────────────────────────
echo -e "${Y}→ Démarrage du frontend (Vite preview) sur :3000…${N}"
cd "$KOMPTA_ROOT/frontend"
npx vite preview --port 3000 --host 127.0.0.1 --strictPort \
  > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo -e "${G}  ✓ Frontend PID $FRONTEND_PID${N}"

# ── 5. Attente que les services soient prêts ───────────────────────────────
echo -e "${Y}→ Attente des services…${N}"
for i in {1..15}; do
  if curl -sf http://127.0.0.1:8010/api/health > /dev/null && curl -sf http://127.0.0.1:3000/ > /dev/null; then
    echo -e "${G}  ✓ Backend + frontend prêts${N}"
    break
  fi
  sleep 1
done

# ── 6. Cloudflare Tunnel ──────────────────────────────────────────────────
echo -e "${Y}→ Démarrage du tunnel Cloudflare…${N}"

if [ -f "$TOKEN_FILE" ]; then
  # Méthode A : Token Zero Trust (recommandé)
  TOKEN=$(cat "$TOKEN_FILE" | tr -d '[:space:]')
  echo -e "${G}  ✓ Mode token Zero Trust${N}"
  cloudflared tunnel --no-autoupdate run --token "$TOKEN" \
    > "$LOG_DIR/cloudflared.log" 2>&1 &
elif [ -f "$CONFIG_FILE" ] && ! grep -q "REMPLACE_PAR_UUID" "$CONFIG_FILE"; then
  # Méthode B : config YAML classique
  echo -e "${G}  ✓ Mode config YAML${N}"
  cloudflared tunnel --config "$CONFIG_FILE" run kompta \
    > "$LOG_DIR/cloudflared.log" 2>&1 &
else
  echo -e "${R}  ✗ Aucune méthode de tunnel configurée.${N}"
  echo -e "${Y}     Option A (recommandée) : crée infra/.tunnel-token avec ton token Zero Trust${N}"
  echo -e "${Y}     Option B : configure infra/cloudflared.yml via bash infra/setup-tunnel.sh${N}"
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 1
fi
TUNNEL_PID=$!
echo -e "${G}  ✓ Tunnel PID $TUNNEL_PID${N}"

sleep 3

# ── 7. Récap ──────────────────────────────────────────────────────────────
echo ""
echo -e "${G}═══════════════════════════════════════════════════════════════${N}"
echo -e "${G}  ✓ KOMPTA est en ligne !${N}"
echo -e "${G}═══════════════════════════════════════════════════════════════${N}"
echo -e "  Frontend : ${B}https://kompta0.com${N}"
echo -e "  Frontend : ${B}https://www.kompta0.com${N}"
echo -e "  API      : ${B}https://api.kompta0.com${N}"
echo -e "  Login    : ${G}superadmin@kompta0.com${N}"
echo ""
echo -e "  Logs :"
echo -e "    tail -f infra/logs/backend.log"
echo -e "    tail -f infra/logs/frontend.log"
echo -e "    tail -f infra/logs/cloudflared.log"
echo ""
echo -e "  ${Y}Ctrl+C pour tout arrêter${N}"
echo ""

cleanup() {
  echo ""
  echo -e "${Y}→ Arrêt de KOMPTA…${N}"
  kill $BACKEND_PID $FRONTEND_PID $TUNNEL_PID 2>/dev/null || true
  sleep 1
  lsof -ti :8010 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  pkill -f "cloudflared.*run" 2>/dev/null || true
  echo -e "${G}  ✓ Tous les services arrêtés${N}"
  exit 0
}
trap cleanup INT TERM

wait

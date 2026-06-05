#!/usr/bin/env bash
# setup-tunnel.sh — Setup initial du tunnel Cloudflare nommé pour kompta0.com.
#
# À lancer UNE seule fois. Crée le tunnel, route les DNS, met à jour cloudflared.yml.

set -e

KOMPTA_ROOT="/Users/davyokemba/Documents/kompta"
CONFIG_FILE="$KOMPTA_ROOT/infra/cloudflared.yml"
TUNNEL_NAME="kompta"

G='\033[0;32m'; R='\033[0;31m'; B='\033[0;34m'; Y='\033[0;33m'; N='\033[0m'

echo -e "${B}══════════════════════════════════════════════════════════════${N}"
echo -e "${B}  KOMPTA — Setup initial du tunnel Cloudflare${N}"
echo -e "${B}══════════════════════════════════════════════════════════════${N}"

# ── 1. Auth Cloudflare (ouvre le navigateur) ───────────────────────────────
if [ ! -f ~/.cloudflared/cert.pem ]; then
  echo -e "${Y}→ Authentification Cloudflare (le navigateur va s'ouvrir)…${N}"
  echo -e "${Y}  Choisis le domaine kompta0.com dans la liste${N}"
  cloudflared tunnel login
  echo -e "${G}  ✓ Authentifié${N}"
else
  echo -e "${G}  ✓ Déjà authentifié (cert.pem présent)${N}"
fi

# ── 2. Créer le tunnel ─────────────────────────────────────────────────────
if cloudflared tunnel list 2>/dev/null | grep -q "^[a-f0-9-]*[[:space:]]*$TUNNEL_NAME[[:space:]]"; then
  echo -e "${G}  ✓ Tunnel \"$TUNNEL_NAME\" déjà créé${N}"
  TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | grep "[[:space:]]$TUNNEL_NAME[[:space:]]" | awk '{print $1}')
else
  echo -e "${Y}→ Création du tunnel \"$TUNNEL_NAME\"…${N}"
  cloudflared tunnel create "$TUNNEL_NAME"
  TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | grep "[[:space:]]$TUNNEL_NAME[[:space:]]" | awk '{print $1}')
  echo -e "${G}  ✓ Tunnel créé — UUID : $TUNNEL_UUID${N}"
fi

if [ -z "$TUNNEL_UUID" ]; then
  echo -e "${R}  ✗ Impossible de récupérer l'UUID du tunnel${N}"
  exit 1
fi

# ── 3. Mettre à jour cloudflared.yml avec l'UUID réel ──────────────────────
echo -e "${Y}→ Mise à jour de $CONFIG_FILE avec UUID $TUNNEL_UUID…${N}"
sed -i '' "s|REMPLACE_PAR_UUID_DU_TUNNEL|$TUNNEL_UUID|g" "$CONFIG_FILE"
echo -e "${G}  ✓ Config à jour${N}"

# ── 4. Routes DNS (1 entrée par hostname dans Cloudflare DNS) ──────────────
echo -e "${Y}→ Création des routes DNS…${N}"
for host in "kompta0.com" "www.kompta0.com" "api.kompta0.com"; do
  if cloudflared tunnel route dns "$TUNNEL_NAME" "$host" 2>&1 | grep -qi "already exists"; then
    echo -e "${G}  ✓ $host → déjà routé${N}"
  else
    cloudflared tunnel route dns "$TUNNEL_NAME" "$host" 2>&1 | tail -1
    echo -e "${G}  ✓ $host → routé vers le tunnel${N}"
  fi
done

echo ""
echo -e "${G}══════════════════════════════════════════════════════════════${N}"
echo -e "${G}  ✓ Setup terminé !${N}"
echo -e "${G}══════════════════════════════════════════════════════════════${N}"
echo ""
echo -e "  Tunnel UUID  : ${B}$TUNNEL_UUID${N}"
echo -e "  Hostnames    : kompta0.com, www.kompta0.com, api.kompta0.com"
echo -e "  Credentials  : ~/.cloudflared/$TUNNEL_UUID.json"
echo ""
echo -e "  Prochaine étape : ${Y}bash infra/start-kompta.sh${N}"
echo ""

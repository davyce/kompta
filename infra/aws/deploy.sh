#!/usr/bin/env bash
# Déploiement / mise à jour KOMPTA sur l'instance Lightsail.
# À exécuter SUR l'instance (après git pull) :
#   cd /opt/kompta/infra/aws && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env.production ]]; then
  echo "ERREUR : .env.production manquant. Copier .env.production.example et le remplir." >&2
  exit 1
fi

echo "==> Pull du code"
git -C ../.. pull --ff-only

echo "==> Build & (re)démarrage des conteneurs"
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo "==> Nettoyage des images orphelines"
docker image prune -f >/dev/null

echo "==> Statut"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "Santé backend :"
curl -fsS https://"$(grep ^DOMAIN .env.production | cut -d= -f2)"/api/health && echo " OK" || echo " (HTTPS pas encore prêt — vérifier DNS + Caddy logs)"

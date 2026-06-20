#!/usr/bin/env bash
# Déploiement / mise à jour KOMPTA sur l'instance Lightsail.
# La prod utilise le docker-compose.yml RACINE + le fichier d'env de ce dossier.
# À exécuter SUR l'instance :
#   /opt/kompta/infra/aws/deploy.sh
set -euo pipefail

ROOT="/opt/kompta"
ENV_FILE="$ROOT/infra/aws/.env.production"
COMPOSE="docker compose --env-file $ENV_FILE"
cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERREUR : $ENV_FILE manquant. Copier .env.production.example et le remplir." >&2
  exit 1
fi

echo "==> Récupération du code (origin/main)"
git fetch origin
git reset --hard origin/main

echo "==> Build & (re)démarrage"
$COMPOSE build --no-cache backend frontend
$COMPOSE up -d --force-recreate

echo "==> Nettoyage des images orphelines"
docker image prune -f >/dev/null

echo "==> Statut"
$COMPOSE ps
echo ""
echo "Santé backend :"
curl -fsS http://localhost:8010/api/health && echo " OK" || echo " (backend pas prêt — voir logs)"

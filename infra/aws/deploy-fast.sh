#!/usr/bin/env bash
# Déploiement RAPIDE de KOMPTA sur l'instance Lightsail — PULL des images
# pré-construites par GitHub Actions (ghcr.io/davyce/kompta-{backend,frontend})
# au lieu de rebuild sur l'instance (rebuild = 15+ min et a déjà rendu
# l'instance inutilisable, cf. incident du 2026-07-03).
#
# Prérequis :
#   - Les images GHCR doivent exister (poussées par
#     .github/workflows/build-and-push.yml à chaque push sur main) ET être
#     accessibles en pull depuis le serveur (packages publics recommandé —
#     voir infra/aws/README.md pour la marche à suivre).
#
# À exécuter SUR l'instance :
#   /opt/kompta/infra/aws/deploy-fast.sh
#
# En cas de souci (GHCR indisponible, image cassée), fallback :
#   /opt/kompta/infra/aws/deploy.sh   (rebuild local, plus lent mais éprouvé)
set -euo pipefail

ROOT="/opt/kompta"
ENV_FILE="$ROOT/infra/aws/.env.production"
# --profile postgres : la prod tourne sur PostgreSQL depuis le 2026-07-15
# (voir docs/POSTGRES_MIGRATION.md) — sans ce profil, `compose up` ne
# redémarrerait pas le conteneur postgres après ce déploiement.
COMPOSE="docker compose -f $ROOT/docker-compose.yml -f $ROOT/docker-compose.prod.yml --env-file $ENV_FILE --profile postgres"
cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERREUR : $ENV_FILE manquant. Copier .env.production.example et le remplir." >&2
  exit 1
fi

echo "==> Récupération du code (origin/main)"
git fetch origin
git reset --hard origin/main

echo "==> Pull des images pré-construites (GHCR)"
$COMPOSE pull

echo "==> (Re)démarrage"
$COMPOSE up -d --force-recreate

echo "==> Nettoyage des images orphelines"
docker image prune -f >/dev/null

echo "==> Statut"
$COMPOSE ps
echo ""
echo "Santé backend :"
curl -fsS http://localhost:8010/api/health && echo " OK" || echo " (backend pas prêt — voir logs)"

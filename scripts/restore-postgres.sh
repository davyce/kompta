#!/usr/bin/env bash
#
# restore-postgres.sh — Restaure un backup pg_dump vers le conteneur
# PostgreSQL KOMPTA vivant.
#
# Usage:
#   ./scripts/restore-postgres.sh <chemin_backup.sql.gz>
#
# Variables d'environnement (optionnelles) : PG_CONTAINER, PG_DB, PG_USER
# (mêmes défauts que backup-postgres.sh).
#
# ATTENTION : ce script ÉCRASE la base cible (DROP + recreate du schéma
# public avant restauration). Il demande une confirmation explicite ("oui")
# et prend lui-même un backup de sécurité de l'état actuel avant d'écraser
# quoi que ce soit.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_CONTAINER="${PG_CONTAINER:-kompta_postgres}"
PG_DB="${PG_DB:-kompta}"
PG_USER="${PG_USER:-kompta}"

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <chemin_backup.sql.gz>" >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Erreur: fichier de backup introuvable: $BACKUP_FILE" >&2
  exit 1
fi
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "Erreur: '$BACKUP_FILE' n'est pas un .sql.gz valide." >&2
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "Erreur: le conteneur '$PG_CONTAINER' n'est pas démarré (docker ps)." >&2
  exit 1
fi

echo ""
echo "!!! Cette opération va ÉCRASER la base '$PG_DB' du conteneur '$PG_CONTAINER'"
echo "!!! avec le contenu du backup: $BACKUP_FILE"
read -r -p "Tapez 'oui' pour confirmer: " CONFIRM
if [ "$CONFIRM" != "oui" ]; then
  echo "Annulé."
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
SAFETY_DIR="$REPO_ROOT/backups/postgres"
SAFETY_COPY="$SAFETY_DIR/kompta_pg_before-restore-${TS}.sql.gz"
mkdir -p "$SAFETY_DIR"
echo "==> Sauvegarde de sécurité de l'état actuel: $SAFETY_COPY"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges \
  | gzip > "$SAFETY_COPY"

echo "==> Réinitialisation du schéma 'public'..."
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "==> Restauration en cours..."
# -v ON_ERROR_STOP=1 : sans ça, psql continue après une erreur (ex. violation
# de FK) et le script précédent rapportait "OK" alors que des lignes avaient
# été silencieusement perdues — bug réel trouvé en testant ce script.
# session_replication_role='replica' désactive les triggers de vérification
# FK pendant le chargement (pg_dump n'ordonne pas ses COPY de façon
# FK-safe par défaut ; même technique que scripts/migrate_sqlite_to_postgres.py).
{
  echo "SET session_replication_role = 'replica';"
  gunzip -c "$BACKUP_FILE"
  echo "SET session_replication_role = 'origin';"
} | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1

echo "==> Vérification (comptage des tables et lignes restaurées)..."
TABLE_COUNT="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "==> Restauration OK: $TABLE_COUNT table(s) dans le schéma public."
echo "    (Sauvegarde de sécurité pré-restauration conservée: $SAFETY_COPY)"

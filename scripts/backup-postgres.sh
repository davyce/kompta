#!/usr/bin/env bash
#
# backup-postgres.sh — Sauvegarde du conteneur PostgreSQL KOMPTA (profil
# "postgres" du docker-compose racine), pour compenser l'absence de backup
# managé qu'offrirait un service RDS.
#
# Usage:
#   ./scripts/backup-postgres.sh
#
# Variables d'environnement (toutes optionnelles) :
#   PG_CONTAINER   Nom du conteneur (défaut: kompta_postgres)
#   PG_DB          Base à sauvegarder (défaut: kompta)
#   PG_USER        Rôle de connexion (défaut: kompta)
#   BACKUP_DIR     Dossier de sortie (défaut: <repo>/backups/postgres)
#   RETENTION_DAYS Nombre de jours de sauvegardes à conserver (défaut: 14)
#
# Produit backups/postgres/kompta_pg_<timestamp>.sql.gz via `pg_dump`
# (format texte compressé — restaurable avec `gunzip -c fichier.sql.gz | psql`,
# voir scripts/restore-postgres.sh). Supprime automatiquement les sauvegardes
# plus vieilles que RETENTION_DAYS.
#
# Pensé pour tourner en cron quotidien sur le serveur, ex. (crontab -e) :
#   0 3 * * * /opt/kompta/scripts/backup-postgres.sh >> /var/log/kompta-pg-backup.log 2>&1
#
# Le dossier backups/ est gitignored — ne JAMAIS committer un backup (il
# contient de vraies données clients).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_CONTAINER="${PG_CONTAINER:-kompta_postgres}"
PG_DB="${PG_DB:-kompta}"
PG_USER="${PG_USER:-kompta}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/kompta_pg_${TS}.sql.gz"

if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "Erreur: le conteneur '$PG_CONTAINER' n'est pas démarré (docker ps)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "==> Sauvegarde PostgreSQL: $PG_CONTAINER/$PG_DB -> $DEST"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges \
  | gzip > "$DEST"

echo "==> Vérification (le fichier n'est pas vide et se décompresse)..."
if [ ! -s "$DEST" ] || ! gzip -t "$DEST" 2>/dev/null; then
  echo "Erreur: le backup semble vide ou corrompu: $DEST" >&2
  rm -f "$DEST"
  exit 1
fi

SIZE="$(du -h "$DEST" | cut -f1)"
echo "==> Backup OK: $DEST ($SIZE)"

echo "==> Rotation: suppression des backups de plus de ${RETENTION_DAYS} jours..."
find "$BACKUP_DIR" -name 'kompta_pg_*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

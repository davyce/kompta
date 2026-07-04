#!/usr/bin/env bash
#
# restore-db.sh — Restaure un backup SQLite KOMPTA vers la base vivante.
#
# Usage:
#   ./scripts/restore-db.sh <chemin_backup> [chemin_db_cible]
#
#   chemin_backup    : obligatoire, un fichier produit par scripts/backup-db.sh
#   chemin_db_cible  : optionnel, par défaut backend/kompta.db
#
# ATTENTION : ce script écrase la base cible. Il demande une confirmation
# explicite ("oui") avant de le faire, et fait lui-même une sauvegarde de
# sécurité de la base cible actuelle (suffixe .before-restore-<timestamp>)
# avant d'écraser quoi que ce soit.
#
# La restauration réutilise la même API SQLite ".backup" (dans le sens
# inverse : backup -> cible) pour garantir une copie cohérente.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DB="$REPO_ROOT/backend/kompta.db"

BACKUP_FILE="${1:-}"
DB_PATH="${2:-$DEFAULT_DB}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <chemin_backup> [chemin_db_cible]" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Erreur: fichier de backup introuvable: $BACKUP_FILE" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "Erreur: sqlite3 CLI introuvable." >&2
  exit 1
fi

echo "==> Vérification d'intégrité du backup à restaurer..."
CHECK="$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")"
if [ "$CHECK" != "ok" ]; then
  echo "Erreur: le fichier de backup n'est pas une base SQLite saine ($CHECK)" >&2
  exit 1
fi

echo ""
echo "!!! Cette opération va ÉCRASER la base cible: $DB_PATH"
echo "!!! avec le contenu du backup: $BACKUP_FILE"
read -r -p "Tapez 'oui' pour confirmer: " CONFIRM
if [ "$CONFIRM" != "oui" ]; then
  echo "Annulé."
  exit 1
fi

if [ -f "$DB_PATH" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  SAFETY_COPY="${DB_PATH}.before-restore-${TS}"
  echo "==> Sauvegarde de sécurité de la base cible actuelle: $SAFETY_COPY"
  sqlite3 "$DB_PATH" ".backup '$SAFETY_COPY'"
fi

echo "==> Restauration en cours..."
sqlite3 "$BACKUP_FILE" ".backup '$DB_PATH'"

echo "==> Vérification d'intégrité post-restauration..."
CHECK_AFTER="$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;")"
if [ "$CHECK_AFTER" != "ok" ]; then
  echo "Erreur: la base restaurée a échoué l'integrity_check ($CHECK_AFTER)" >&2
  exit 1
fi

echo "==> Restauration OK: $DB_PATH (integrity_check: ok)"

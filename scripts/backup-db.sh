#!/usr/bin/env bash
#
# backup-db.sh — Sauvegarde SQLite-safe de la base de développement KOMPTA.
#
# Usage:
#   ./scripts/backup-db.sh [chemin_vers_la_db]
#
#   chemin_vers_la_db : optionnel, par défaut backend/kompta.db (lu depuis
#                        DATABASE_URL dans backend/.env si présent, sinon le
#                        chemin par défaut backend/kompta.db).
#
# Produit un fichier backups/kompta_<timestamp>.db à la racine du repo, créé
# via l'API SQLite ".backup" (PAS un simple `cp`) : une copie brute d'un
# fichier SQLite ouvert en écriture peut être corrompue (page mid-write,
# WAL non checkpointé, etc). ".backup" garantit un snapshot cohérent même si
# la base est utilisée en parallèle par le serveur backend.
#
# Le dossier backups/ est gitignored — ne JAMAIS committer un backup (il
# contient de vraies données clients).
#
# Voir aussi scripts/restore-db.sh pour restaurer un backup.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DB="$REPO_ROOT/backend/kompta.db"
DB_PATH="${1:-$DEFAULT_DB}"
BACKUP_DIR="$REPO_ROOT/backups"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/kompta_${TS}.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Erreur: base introuvable: $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "Erreur: sqlite3 CLI introuvable. Installez-le (brew install sqlite3 / apt install sqlite3)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "==> Sauvegarde SQLite-safe: $DB_PATH -> $DEST"
sqlite3 "$DB_PATH" ".backup '$DEST'"

echo "==> Vérification d'intégrité du backup..."
CHECK="$(sqlite3 "$DEST" "PRAGMA integrity_check;")"
if [ "$CHECK" != "ok" ]; then
  echo "Erreur: le backup a échoué l'integrity_check ($CHECK)" >&2
  exit 1
fi

echo "==> Backup OK: $DEST (integrity_check: ok)"

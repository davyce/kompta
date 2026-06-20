#!/usr/bin/env bash
# Sauvegarde de la base SQLite de KOMPTA (snapshot cohérent en ligne).
# La prod tourne via le docker-compose.yml RACINE (SQLite dans le volume
# kompta_storage à /app/storage/kompta.db).
#
# Installer en cron sur l'instance (chaque nuit à 3h) :
#   0 3 * * * /opt/kompta/infra/aws/backup.sh >> /var/log/kompta-backup.log 2>&1
set -euo pipefail

ENV_FILE="/opt/kompta/infra/aws/.env.production"
COMPOSE="docker compose --env-file $ENV_FILE"
TS="$(date +%Y%m%d_%H%M%S)"
HOST_DIR="/opt/kompta/backups"
RETENTION_DAYS=14
mkdir -p "$HOST_DIR"

cd /opt/kompta

# 1) Snapshot SQLite cohérent (API .backup) DANS le volume, + rétention interne.
$COMPOSE exec -T backend python3 - "$TS" "$RETENTION_DAYS" <<'PY'
import sqlite3, os, glob, sys
ts, keep = sys.argv[1], int(sys.argv[2])
os.makedirs('/app/storage/backups', exist_ok=True)
out = f'/app/storage/backups/kompta_{ts}.db'
src = sqlite3.connect('/app/storage/kompta.db'); dst = sqlite3.connect(out)
with dst:
    src.backup(dst)
src.close(); dst.close()
files = sorted(glob.glob('/app/storage/backups/kompta_*.db'))
for f in files[:-keep]:
    os.remove(f)
print('snapshot', out)
PY

# 2) Miroir HORS du volume (sur le disque hôte) + compression + rétention.
$COMPOSE cp "backend:/app/storage/backups/kompta_${TS}.db" "$HOST_DIR/kompta_${TS}.db"
gzip -f "$HOST_DIR/kompta_${TS}.db"
find "$HOST_DIR" -name 'kompta_*.db.gz' -mtime +"$RETENTION_DAYS" -delete

echo "==> Backup OK : $HOST_DIR/kompta_${TS}.db.gz"

# Restauration (exemple) :
#   gunzip -c /opt/kompta/backups/kompta_XXX.db.gz > /tmp/restore.db
#   docker compose --env-file infra/aws/.env.production cp /tmp/restore.db backend:/app/storage/kompta.db
#   docker compose --env-file infra/aws/.env.production restart backend

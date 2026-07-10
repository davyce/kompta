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
# Bucket S3 offsite (protège contre une panne/perte de l'instance elle-même,
# pas seulement du volume Docker) — nécessite `aws configure` fait une fois
# sur l'instance avec un utilisateur IAM limité à s3:PutObject/ListBucket sur
# ce bucket. Laisser vide désactive silencieusement cette étape (pas
# d'échec du backup local si l'export offsite n'est pas configuré).
S3_BUCKET="${KOMPTA_BACKUP_S3_BUCKET:-kompta-backups-771413671974}"
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

# 3) Export offsite vers S3 — protège contre une panne de l'instance/du
# disque entier, pas seulement une erreur applicative. Ne fait jamais
# échouer le backup local si l'upload échoue (réseau coupé, etc.) : le
# backup local reste la source de vérité immédiate, S3 est une assurance
# supplémentaire.
if [[ -n "$S3_BUCKET" ]] && command -v aws >/dev/null 2>&1; then
  if aws s3 cp "$HOST_DIR/kompta_${TS}.db.gz" "s3://$S3_BUCKET/kompta_${TS}.db.gz" --only-show-errors; then
    echo "==> Export offsite OK : s3://$S3_BUCKET/kompta_${TS}.db.gz"
  else
    echo "==> AVERTISSEMENT : échec de l'export offsite S3 (backup local conservé)" >&2
  fi
else
  echo "==> Export offsite S3 ignoré (S3_BUCKET vide ou CLI aws absent)"
fi

# Restauration (exemple) :
#   gunzip -c /opt/kompta/backups/kompta_XXX.db.gz > /tmp/restore.db
#   docker compose --env-file infra/aws/.env.production cp /tmp/restore.db backend:/app/storage/kompta.db
#   docker compose --env-file infra/aws/.env.production restart backend
#
# Restauration depuis S3 (si l'instance a été perdue) :
#   aws s3 cp s3://kompta-backups-771413671974/kompta_XXX.db.gz /tmp/restore.db.gz
#   gunzip /tmp/restore.db.gz

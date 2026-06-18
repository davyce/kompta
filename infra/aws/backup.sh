#!/usr/bin/env bash
# Sauvegarde Postgres -> fichier local + upload S3 (si BACKUP_S3_BUCKET défini).
# À planifier en cron sur l'instance, ex. chaque nuit à 3h :
#   0 3 * * * cd /opt/kompta/infra/aws && ./backup.sh >> /var/log/kompta-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"
set -a; source .env.production; set +a

TS="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="/opt/kompta/backups"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/kompta_${TS}.sql.gz"

echo "==> Dump Postgres -> $FILE"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$FILE"

# Rétention locale : 14 jours
find "$OUT_DIR" -name 'kompta_*.sql.gz' -mtime +14 -delete

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "==> Upload S3 s3://$BACKUP_S3_BUCKET/"
  aws s3 cp "$FILE" "s3://$BACKUP_S3_BUCKET/db/" --region "${AWS_REGION:-eu-west-3}"
fi

echo "==> Backup OK : $FILE"
# Restauration :
#   gunzip -c kompta_XXX.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="$OUT_DIR/lalapay-$STAMP.dump"
echo "Backup written to $OUT_DIR/lalapay-$STAMP.dump"

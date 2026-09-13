#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
DUMP="${1:?Usage: ./scripts/db-restore.sh backups/file.dump}"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DUMP"
echo "Restore completed from $DUMP"

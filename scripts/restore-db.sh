#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "usage: scripts/restore-db.sh backups/postgres/ziot-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.yml}"
DATABASE_NAME="${POSTGRES_DB:-ziot}"
DATABASE_USER="${POSTGRES_USER:-ziot}"
backup_file="$1"

if [ ! -f "$backup_file" ]; then
  echo "backup file not found: $backup_file" >&2
  exit 2
fi

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U "$DATABASE_USER" -d "$DATABASE_NAME" --clean --if-exists < "$backup_file"

echo "database restored from: $backup_file"

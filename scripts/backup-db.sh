#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATABASE_NAME="${POSTGRES_DB:-ziot}"
DATABASE_USER="${POSTGRES_USER:-ziot}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/ziot-${timestamp}.dump"

mkdir -p "$BACKUP_DIR"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DATABASE_USER" -d "$DATABASE_NAME" -Fc > "$backup_file"

find "$BACKUP_DIR" -type f -name 'ziot-*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "backup written: $backup_file"

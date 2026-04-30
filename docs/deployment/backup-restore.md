# Backup And Restore

ZiOT MVP data is primarily stored in PostgreSQL. Firmware files are stored in
MinIO/S3 and should be backed up separately if they are not reproducible.

## PostgreSQL Backup

Run:

```bash
scripts/backup-db.sh
```

Defaults:

| Variable | Default | Description |
| --- | --- | --- |
| `COMPOSE_FILE` | `deploy/docker-compose.yml` | Compose file path |
| `BACKUP_DIR` | `backups/postgres` | Backup output directory |
| `RETENTION_DAYS` | `14` | Delete local dumps older than this |
| `POSTGRES_DB` | `ziot` | Database name |
| `POSTGRES_USER` | `ziot` | Database user |

The script writes a custom-format dump:

```text
backups/postgres/ziot-YYYYMMDDTHHMMSSZ.dump
```

## PostgreSQL Restore

Stop web and worker before restoring to avoid writes during restore:

```bash
docker compose -f deploy/docker-compose.yml stop web worker
scripts/restore-db.sh backups/postgres/ziot-YYYYMMDDTHHMMSSZ.dump
docker compose -f deploy/docker-compose.yml start web worker
```

`restore-db.sh` uses `pg_restore --clean --if-exists`, so existing database
objects are replaced.

## MinIO Firmware Backup

For local MinIO volumes, include the Docker volume in your host snapshot plan:

```text
minio-data
```

For S3-compatible production storage, enable bucket versioning or provider-side
scheduled backup. Firmware metadata in PostgreSQL references object URLs and
SHA256 values; the actual binary object must also remain available.

## Verification

After restore:

```bash
docker compose -f deploy/docker-compose.yml ps
pnpm smoke
```

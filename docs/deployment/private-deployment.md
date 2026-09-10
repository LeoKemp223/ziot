# Private Deployment Guide

This guide starts the ZiOT MVP on one private Docker Compose host.

> 生产部署（HTTPS 域名 + MQTT TLS + 国内源构建）见 [production.md](./production.md)；
> 无 root 环境见 [no-root-setup.md](./no-root-setup.md)。

## Host Profile

- 2 CPU cores, 4 GB RAM, 70 GB disk.
- Docker Engine with Compose v2.
- Node.js and pnpm only needed for local development commands outside Compose.
- Keep EMQX Dashboard, PostgreSQL, Redis, and MinIO Console on a private network.

## Start The Stack

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Run database migration and seed data:

```bash
DATABASE_URL=postgresql://ziot:ziot@localhost:5432/ziot pnpm --filter @ziot/db prisma:generate
DATABASE_URL=postgresql://ziot:ziot@localhost:5432/ziot pnpm --filter @ziot/db seed
```

Configure EMQX rule-engine callbacks:

```bash
scripts/setup-emqx-webhook.sh
```

Default admin account:

| Field | Value |
| --- | --- |
| Account | `13800000001` |
| Password | `Admin123456` |

Default operator account:

| Field | Value |
| --- | --- |
| Account | `13800000002` |
| Password | `Operator123456` |

Open the console:

```text
http://localhost:3000
```

## Environment

Set production secrets before exposing the service:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | Session token signing secret |
| `PUBLIC_APP_URL` | Public console URL |
| `EMQX_API_URL` | EMQX management API URL reachable by web |
| `EMQX_DASHBOARD_USERNAME` | EMQX API user |
| `EMQX_DASHBOARD_PASSWORD` | EMQX API password |
| `MINIO_ENDPOINT` | MinIO/S3 public endpoint for presigned URLs (browser/device reachable) |
| `MINIO_PORT` | Public endpoint port (default: 9000, 443 when SSL) |
| `MINIO_USE_SSL` | `"true"` to sign presigned URLs with https |
| `MINIO_BUCKET` | Firmware bucket (private; created lazily on first use) |
| `MINIO_INTERNAL_ENDPOINT` | In-network endpoint for server-side put/remove (defaults to `MINIO_ENDPOINT`) |
| `MINIO_INTERNAL_PORT` | In-network endpoint port (defaults to `MINIO_PORT`) |
| `MINIO_INTERNAL_USE_SSL` | `"true"` to use https for in-network ops |
| `MINIO_ACCESS_KEY` | Object storage access key |
| `MINIO_SECRET_KEY` | Object storage secret key |

## HTTPS Reverse Proxy

Use `deploy/nginx/nginx.conf` as the HTTPS reverse proxy sample. Replace
`ziot.example.com` and mount certificates at:

```text
/etc/nginx/certs/fullchain.pem
/etc/nginx/certs/privkey.pem
```

Only expose:

- `80` and `443` for the web console and API.
- `1883` for MQTT if devices connect directly to this host.

Keep `18083` bound to `127.0.0.1` or reachable only through VPN/SSH tunnel.

## Health Checks

Compose includes health checks for:

- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- EMQX: `emqx ctl status`
- MinIO: `mc ready local`
- Web: `GET /api/v1/health`
- Worker: process check for the worker dev process

Check status:

```bash
docker compose -f deploy/docker-compose.yml ps
```

## Smoke Test

After the stack is up and EMQX webhooks are configured:

```bash
pnpm seed:demo
pnpm smoke
```

The smoke test covers admin login, invitation registration, product/device
creation, MQTT connect and property report, command control, HTTP property
report, and OTA progress.

## Backup

Create a PostgreSQL custom-format backup:

```bash
scripts/backup-db.sh
```

Restore from a backup:

```bash
scripts/restore-db.sh backups/postgres/ziot-YYYYMMDDTHHMMSSZ.dump
```

See `docs/deployment/backup-restore.md` for details.

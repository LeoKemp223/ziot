# Lightweight Sizing Guide

Default target: one private server with 2 CPU cores, 4 GB RAM, and 70 GB disk.

## Resource Limits

`deploy/docker-compose.yml` sets these Compose limits:

| Service | CPU | Memory |
| --- | ---: | ---: |
| web | 0.50 | 1024 MB |
| worker | 0.20 | 512 MB |
| PostgreSQL | 0.45 | 768 MB |
| Redis | 0.20 | 384 MB |
| EMQX | 0.45 | 768 MB |
| MinIO | 0.20 | 512 MB |

The total limit is 2 CPU and 3968 MB memory. CPU limits are soft scheduling
guidance in non-Swarm Compose; the memory total stays within the 4 GB host target.

## Database And Cache

PostgreSQL lightweight config:

```text
shared_buffers = 256MB
work_mem = 4MB
maintenance_work_mem = 128MB
max_connections = 30
```

Redis lightweight config:

```text
maxmemory 256mb
maxmemory-policy allkeys-lru
```

## Log And Data Retention

Docker log rotation is configured for all services:

```text
max-size = 50m
max-file = 3
```

Recommended MVP retention:

| Data | Retention |
| --- | --- |
| Device logs | 7 days |
| Command records | 30 days |
| OTA records | 180 days |
| Audit logs | 180 days |
| Firmware binaries | Current plus latest 2 historical versions |

## Pressure Commands

Lightweight pressure smoke:

```bash
pnpm smoke:lightweight
```

MVP acceptance pressure:

```bash
pnpm pressure:mvp
```

Non-blocking capacity exploration:

```bash
pnpm pressure:capacity
```

Record at least:

- Host CPU, memory, and disk usage.
- `docker compose ps` health status.
- PostgreSQL connection count.
- Redis evictions and memory usage.
- EMQX connected sessions.
- API failures or command timeout count.

The MVP target is 300 MQTT connections and 15 inbound messages per second for
15 minutes without web, worker, EMQX, PostgreSQL, or Redis crashing.

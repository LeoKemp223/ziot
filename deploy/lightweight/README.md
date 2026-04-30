# Lightweight Deployment Profile

This profile targets one private server with 2 CPU cores, 4 GB RAM, and about
70 GB disk. It keeps the MVP stack small: PostgreSQL, Redis, EMQX, MinIO, web,
and worker.

Key limits:

- PostgreSQL: 30 connections, 256 MB shared buffers.
- Redis: 256 MB maxmemory with `allkeys-lru`.
- EMQX: 500 TCP connections in the default listener.
- Docker logs: 50 MB per file, 3 retained files, configured in Compose.
- EMQX Dashboard: bound to `127.0.0.1:18083` by Compose. Expose it only through
  SSH tunnel, VPN, or a protected internal network.

The profile is a starting point. Raise limits only after checking CPU, memory,
disk usage, PostgreSQL connection count, Redis evictions, and EMQX session load.

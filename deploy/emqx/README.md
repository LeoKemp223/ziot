# EMQX Local Integration

The local Compose setup mounts `deploy/emqx/dev.conf` into EMQX and configures:

- HTTP password authentication: `http://web:3000/api/internal/emqx/auth`
- HTTP authorization: `http://web:3000/api/internal/emqx/acl`

Both URLs use the Docker Compose service name `web`, not `host.docker.internal`.

The webhook endpoint for connection lifecycle events is:

```text
http://web:3000/api/internal/emqx/webhook
```

Run the setup script after EMQX starts to create the HTTP connector, action, and
rule for `client.connected` and `client.disconnected` events:

```bash
./scripts/setup-emqx-webhook.sh
```

The script requires `curl` and `jq`.

If EMQX runs in Docker but Web runs on the host, use:

```bash
ZIOT_WEBHOOK_BASE_URL=http://host.docker.internal:3000 ./scripts/setup-emqx-webhook.sh
```

The Next.js handler accepts the EMQX lifecycle event body and updates device
online state.

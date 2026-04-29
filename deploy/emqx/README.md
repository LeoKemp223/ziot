# EMQX Local Integration

The local Compose setup mounts `deploy/emqx/dev.conf` into EMQX and configures:

- HTTP password authentication: `http://web:3000/api/internal/emqx/auth`
- HTTP authorization: `http://web:3000/api/internal/emqx/acl`

Both URLs use the Docker Compose service name `web`, not `host.docker.internal`.

The webhook endpoint for connection lifecycle, command reply, and device report
events is:

```text
http://web:3000/api/internal/emqx/webhook
```

Run the setup script after EMQX starts to create the HTTP connector, actions,
and rules for `client.connected`, `client.disconnected`, service reply
messages, and device report messages:

```bash
./scripts/setup-emqx-webhook.sh
```

The script requires `curl` and `jq`.

If EMQX runs in Docker but Web runs on the host, use:

```bash
ZIOT_WEBHOOK_BASE_URL=http://host.docker.internal:3000 ./scripts/setup-emqx-webhook.sh
```

The Next.js handler accepts lifecycle events to update device online state. It
also accepts `/sys/+/+/thing/service/+/reply` messages and updates matching
`device_commands` records by `id` or `request_id`.

Device reports are forwarded from:

- `/sys/+/+/thing/property/post`
- `/sys/+/+/thing/event/post`
- `/sys/+/+/thing/log/post`

Property reports update `device_shadows.reported` and all report messages are
stored in `device_logs` for the device detail page's report history.

OTA progress messages are forwarded from:

- `/ota/+/+/upgrade/progress`
- `/ota/+/+/upgrade/result`

Progress updates write `ota_records`; success results also update the device's
`firmware_version`.

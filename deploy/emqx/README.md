# EMQX Local Integration

The local Compose setup mounts `deploy/emqx/dev.conf` into EMQX and configures:

- HTTP password authentication: `http://web:3000/api/internal/emqx/auth`
- HTTP authorization: `http://web:3000/api/internal/emqx/acl`

Both URLs use the Docker Compose service name `web`, not `host.docker.internal`.

The webhook endpoint for connection lifecycle events is:

```text
http://web:3000/api/internal/emqx/webhook
```

Create a Webhook action in the EMQX dashboard for `client.connected` and
`client.disconnected` events when running local integration tests. The Next.js
handler accepts the standard EMQX event body and updates device online state.

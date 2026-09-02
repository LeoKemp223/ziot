# API Integration Guide

All admin APIs use JSON and the unified envelope:

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {}
}
```

Non-zero `code` values indicate validation, authentication, permission, conflict,
not found, or internal errors. HTTP status matches the error category.

## Authentication

Login:

```http
POST /api/v1/auth/login
content-type: application/json

{
  "account": "13800000001",
  "password": "Admin123456"
}
```

The server sets HTTP-only cookies:

- `ziot_access_token`
- `ziot_refresh_token`
- `ziot_current_org_id`

Browser and same-origin clients should keep these cookies. Script clients can
store `Set-Cookie` values and send them back in the `Cookie` header.

## Main Admin APIs

| Area | Endpoint |
| --- | --- |
| Current user | `GET /api/v1/me` |
| Roles | `GET /api/v1/roles` |
| Invitations | `GET /api/v1/invitations`, `POST /api/v1/invitations` |
| Products | `GET /api/v1/products`, `POST /api/v1/products` |
| Product detail | `GET/PATCH/DELETE /api/v1/products/{product_id}` |
| Devices | `GET /api/v1/devices`, `POST /api/v1/devices` |
| Device detail | `GET/PATCH/DELETE /api/v1/devices/{device_id}` |
| Device shadow | `GET/PATCH /api/v1/devices/{device_id}/shadow` |
| Device topics | `GET /api/v1/devices/{device_id}/topics` |
| Commands | `POST /api/v1/devices/{device_id}/commands` |
| Command detail | `GET /api/v1/commands/{command_id}` |
| Firmware | `GET /api/v1/firmwares`, `POST /api/v1/firmwares` |
| Firmware upload | `POST /api/v1/firmwares/upload` |
| OTA tasks | `GET /api/v1/ota/tasks`, `POST /api/v1/ota/tasks` |
| OTA start | `POST /api/v1/ota/tasks/{task_id}/start` |
| OTA records | `GET /api/v1/ota/tasks/{task_id}/records` |
| Audit logs | `GET /api/v1/audit-logs` |
| Dashboard | `GET /api/v1/dashboard/summary` |

See `docs/api/admin-api.md` for detailed request examples.

## Device Access

Devices connect over MQTT only (property/event/log reports, command invoke and
reply, OTA notify/progress/result topics).

See:

- `docs/device-integration/mqtt-demo.md`
- `docs/device-integration/integration-guide.md`

## Local Smoke Test

```bash
pnpm smoke
```

The script is the fastest way to verify that admin APIs, MQTT callbacks,
command control, and OTA notify/result work together.

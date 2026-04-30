# Device Integration Guide

ZiOT MVP supports MQTT and HTTP devices with JSON payloads.

Default seed credentials:

| Field | MQTT Demo | HTTP Demo |
| --- | --- | --- |
| Product Key | `pk_demo` | `pk_demo` |
| Device Key | `dk_mqtt_demo` | `dk_http_demo` |
| Device Secret | `DeviceSecret123` | `DeviceSecret123` |

## MQTT

Connection:

| Field | Value |
| --- | --- |
| Host | `localhost` |
| Port | `1883` |
| Username | `{product_key}:{device_key}` |
| Password | `{device_secret}` |

Main topics:

| Direction | Topic |
| --- | --- |
| Device publish property | `/sys/{product_key}/{device_key}/thing/property/post` |
| Device publish event | `/sys/{product_key}/{device_key}/thing/event/post` |
| Device publish log | `/sys/{product_key}/{device_key}/thing/log/post` |
| Device subscribe property set | `/sys/{product_key}/{device_key}/thing/property/set` |
| Device subscribe service invoke | `/sys/{product_key}/{device_key}/thing/service/+/invoke` |
| Device publish service reply | `/sys/{product_key}/{device_key}/thing/service/{identifier}/reply` |
| Device subscribe OTA notify | `/ota/{product_key}/{device_key}/upgrade/notify` |
| Device publish OTA progress | `/ota/{product_key}/{device_key}/upgrade/progress` |
| Device publish OTA result | `/ota/{product_key}/{device_key}/upgrade/result` |

Run the demos:

```bash
MQTT_HOST=localhost MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/mqtt-python-demo.py
pnpm --filter @ziot/device-simulator mqtt
```

See `docs/device-integration/mqtt-demo.md` for Python and C build details.

## HTTP

HTTP devices sign each request:

```text
HMAC_SHA256(device_secret, method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + body_sha256)
```

Required headers:

| Header | Purpose |
| --- | --- |
| `x-ziot-product-key` | Product key |
| `x-ziot-device-key` | Device key |
| `x-ziot-device-secret` | Device secret used for bcrypt verification |
| `x-ziot-timestamp` | Millisecond timestamp |
| `x-ziot-nonce` | Replay protection nonce |
| `x-ziot-body-sha256` | SHA256 hex of raw request body |
| `x-ziot-signature` | HMAC-SHA256 signature |

Main endpoints:

| Method | Path |
| --- | --- |
| `POST` | `/device-api/v1/properties` |
| `POST` | `/device-api/v1/events` |
| `POST` | `/device-api/v1/logs` |
| `GET` | `/device-api/v1/commands/pending` |
| `POST` | `/device-api/v1/commands/{request_id}/reply` |
| `GET` | `/device-api/v1/ota/tasks/current` |
| `POST` | `/device-api/v1/ota/tasks/{task_id}/progress` |

Run the demos:

```bash
HTTP_DEVICE_API_URL=http://localhost:3000 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_http_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/http-python-demo.py
pnpm --filter @ziot/device-simulator http
```

See `docs/device-integration/http-demo.md` for C build details.

# Device Integration Guide

ZiOT MVP supports MQTT devices with JSON payloads.

Default seed credentials:

| Field | Value |
| --- | --- |
| Product Key | `pk_demo` |
| Device Key | `dk_mqtt_demo` |
| Device Secret | `DeviceSecret123` |

## MQTT

Connection:

| Field | Value |
| --- | --- |
| Host | `www.ziot.asia` |
| Port | `1883`（明文）/ `8883`（TLS，Let's Encrypt 证书） |
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
MQTT_HOST=www.ziot.asia MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/mqtt-python-demo.py
pnpm --filter @ziot/device-simulator mqtt
```

See `docs/device-integration/mqtt-demo.md` for Python and C build details.

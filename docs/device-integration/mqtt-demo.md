# MQTT 设备接入 Demo

本文档演示设备如何用 MQTT 接入本地 ZiOT 平台。默认示例使用 seed 数据：

| 字段          | 默认值            |
| ------------- | ----------------- |
| Broker（明文）| `www.ziot.asia:1883` |
| Broker（TLS） | `www.ziot.asia:8883`（Let's Encrypt 证书，验证服务器名即可） |
| Product Key   | `pk_demo`         |
| Device Key    | `dk_mqtt_demo`    |
| Device Secret | `DeviceSecret123` |

## 认证参数

MQTT 连接时使用：

| 字段      | 值                           |
| --------- | ---------------------------- |
| Client ID | 默认使用 `device_key`        |
| Username  | `{product_key}:{device_key}` |
| Password  | `device_secret`              |

平台只保存 `device_secret` 的 bcrypt hash。创建设备或重置设备密钥后，响应里的 `device_secret` 只显示一次。

## 启动本地 Broker

本地 demo 依赖 EMQX、Web 回调服务和数据库。先启动本地 Compose：

```bash
docker compose -f deploy/docker-compose.yml up emqx web
```

EMQX 启动后配置连接生命周期、命令回执和上报消息 WebHook，这样设备页才能显示在线/离线、命令回执和上报记录：

```bash
./scripts/setup-emqx-webhook.sh
```

该脚本依赖 `curl` 和 `jq`。

如果 EMQX 运行在 Docker 中、Web 运行在宿主机 `localhost:3000`，使用：

```bash
ZIOT_WEBHOOK_BASE_URL=http://host.docker.internal:3000 ./scripts/setup-emqx-webhook.sh
```

如果是第一次初始化数据库，另开终端执行迁移和 seed：

```bash
pnpm --filter @ziot/db prisma:generate
pnpm --filter @ziot/db exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL=postgresql://ziot:ziot@localhost:5432/ziot pnpm --filter @ziot/db seed
```

确认 `www.ziot.asia:1883`（明文）或 `www.ziot.asia:8883`（TLS）可连接后再运行下面的设备 demo。

## Topic

属性上报：

```text
/sys/{product_key}/{device_key}/thing/property/post
```

事件上报：

```text
/sys/{product_key}/{device_key}/thing/event/post
```

日志上报：

```text
/sys/{product_key}/{device_key}/thing/log/post
```

属性设置下发订阅：

```text
/sys/{product_key}/{device_key}/thing/property/set
```

控制下发 / 服务调用订阅：

```text
/sys/{product_key}/{device_key}/thing/service/+/invoke
```

服务调用回复：

```text
/sys/{product_key}/{device_key}/thing/service/{identifier}/reply
```

OTA 通知订阅：

```text
/ota/{product_key}/{device_key}/upgrade/notify
```

OTA 进度和结果上报：

```text
/ota/{product_key}/{device_key}/upgrade/progress
/ota/{product_key}/{device_key}/upgrade/result
```

控制台设备详情页会展示当前设备的完整 Topic 列表。设备发布属性、事件和日志上报后，会出现在设备详情页的“上报记录”；属性上报还会同步更新设备影子的 `reported`。也可以调用：

```bash
curl http://localhost:3000/api/v1/devices/{device_id}/topics
```

## Python Demo

安装依赖：

```bash
python3 -m pip install paho-mqtt
```

运行：

```bash
python3 docs/device-integration/mqtt-python-demo.py
```

指定设备参数：

```bash
MQTT_HOST=www.ziot.asia MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/mqtt-python-demo.py
```

调整定时属性上报间隔，单位秒，默认 `10`：

```bash
REPORT_INTERVAL_SECONDS=5 MQTT_HOST=www.ziot.asia MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/mqtt-python-demo.py
```

## C Demo

该 demo 使用 Eclipse Paho Embedded C 的 `MQTTPacket`，网络层使用 POSIX socket。先获取 Paho Embedded C 源码：

```bash
git clone https://github.com/eclipse-paho/paho.mqtt.embedded-c.git /tmp/paho.mqtt.embedded-c
```

编译：

```bash
PAHO_EMBEDDED_C_DIR=/tmp/paho.mqtt.embedded-c
gcc docs/device-integration/mqtt-c-demo.c \
  -I"${PAHO_EMBEDDED_C_DIR}/MQTTPacket/src" \
  "${PAHO_EMBEDDED_C_DIR}/MQTTPacket/src/MQTTConnectClient.c" \
  "${PAHO_EMBEDDED_C_DIR}/MQTTPacket/src/MQTTSubscribeClient.c" \
  "${PAHO_EMBEDDED_C_DIR}/MQTTPacket/src/MQTTSerializePublish.c" \
  "${PAHO_EMBEDDED_C_DIR}/MQTTPacket/src/MQTTDeserializePublish.c" \
  "${PAHO_EMBEDDED_C_DIR}/MQTTPacket/src/MQTTPacket.c" \
  -o /tmp/ziot-mqtt-c-demo
```

运行：

```bash
/tmp/ziot-mqtt-c-demo
```

指定设备参数：

```bash
MQTT_HOST=www.ziot.asia MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 /tmp/ziot-mqtt-c-demo
```

调整定时属性上报间隔，单位秒，默认 `10`：

```bash
REPORT_INTERVAL_SECONDS=5 MQTT_HOST=www.ziot.asia MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 /tmp/ziot-mqtt-c-demo
```

两个 demo 都会在连接成功后订阅属性设置、服务调用和 OTA 通知 Topic，立即上报一条属性数据，并按 `REPORT_INTERVAL_SECONDS` 定时上报属性。收到属性设置后，会再次上报属性；收到服务调用后，会自动向对应的 reply Topic 回复 `code=0`。TypeScript MQTT simulator 收到 OTA 通知后会自动上报下载、安装和成功结果。

## 控制下发测试

保持 Python 或 C demo 运行，然后在控制台打开设备详情页，使用“控制下发”面板发送服务调用：

```json
{
  "power": true
}
```

服务标识可以使用 `setSwitch`。demo 收到 `/thing/service/setSwitch/invoke` 后会发布 `/thing/service/setSwitch/reply`，命令记录会更新为成功。

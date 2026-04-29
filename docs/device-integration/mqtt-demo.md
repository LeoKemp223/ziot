# MQTT 设备接入 Demo

本文档演示设备如何用 MQTT 接入本地 ZiOT 平台。默认示例使用 seed 数据：

| 字段          | 默认值            |
| ------------- | ----------------- |
| Broker        | `localhost:1883`  |
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

## Topic

属性上报：

```text
/sys/{product_key}/{device_key}/thing/property/post
```

服务调用订阅：

```text
/sys/{product_key}/{device_key}/thing/service/+/invoke
```

服务调用回复：

```text
/sys/{product_key}/{device_key}/thing/service/{identifier}/reply
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
MQTT_HOST=localhost MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/mqtt-python-demo.py
```

## C Demo

Debian/Ubuntu 安装依赖：

```bash
sudo apt-get install -y gcc libmosquitto-dev
```

编译：

```bash
gcc docs/device-integration/mqtt-c-demo.c -o /tmp/ziot-mqtt-c-demo -lmosquitto
```

运行：

```bash
/tmp/ziot-mqtt-c-demo
```

指定设备参数：

```bash
MQTT_HOST=localhost MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 /tmp/ziot-mqtt-c-demo
```

两个 demo 都会在连接成功后订阅服务调用 Topic，并上报一条属性数据。收到服务调用后，会自动向对应的 reply Topic 回复 `code=0`。

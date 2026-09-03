#!/usr/bin/env python3
"""连接 ziot 线上 Broker 并周期上报设备状态的 demo。

用法（凭据通过环境变量传入，不要写死在代码里）：

  MQTT_HOST=www.ziot.asia MQTT_PORT=1883 \
  PRODUCT_KEY=pk_xxx DEVICE_KEY=dk_xxx DEVICE_SECRET=xxx \
  python3 docs/device-integration/mqtt-live-demo.py

  # TLS（8883，Let's Encrypt 证书，走系统 CA 校验）：
  MQTT_TLS=1 MQTT_HOST=www.ziot.asia PRODUCT_KEY=... DEVICE_KEY=... DEVICE_SECRET=... \
  python3 docs/device-integration/mqtt-live-demo.py

  # 一次性跑 30 秒后自动退出（默认一直运行，Ctrl+C 退出）：
  RUN_SECONDS=30 ... python3 docs/device-integration/mqtt-live-demo.py

约定：
  - clientId = device_key，username = "{product_key}:{device_key}"，password = device_secret
  - 属性（状态）上报 topic：/sys/{pk}/{dk}/thing/property/post，payload: {"id","params"}
  - 平台在线/离线状态由 EMQX connect/disconnect 事件自动维护，无需设备额外上报
"""
import json
import math
import os
import ssl
import time

import paho.mqtt.client as mqtt

MQTT_HOST = os.getenv("MQTT_HOST", "www.ziot.asia")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TLS = os.getenv("MQTT_TLS", "") == "1"
PRODUCT_KEY = os.getenv("PRODUCT_KEY", "")
DEVICE_KEY = os.getenv("DEVICE_KEY", "")
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "")
CLIENT_ID = os.getenv("MQTT_CLIENT_ID", DEVICE_KEY)
RUN_SECONDS = int(os.getenv("RUN_SECONDS", "0"))
REPORT_INTERVAL_SECONDS = max(int(os.getenv("REPORT_INTERVAL_SECONDS", "5")), 1)

USERNAME = f"{PRODUCT_KEY}:{DEVICE_KEY}"
PROPERTY_SET_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/property/set"
PROPERTY_SET_REPLY_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/property/set_reply"
PROPERTY_POST_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/property/post"
SERVICE_INVOKE_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/service/+/invoke"
OTA_NOTIFY_TOPIC = f"/ota/{PRODUCT_KEY}/{DEVICE_KEY}/upgrade/notify"
OTA_PROGRESS_TOPIC = f"/ota/{PRODUCT_KEY}/{DEVICE_KEY}/upgrade/progress"
OTA_RESULT_TOPIC = f"/ota/{PRODUCT_KEY}/{DEVICE_KEY}/upgrade/result"

report_count = 0


def simulate_params():
    """让温度/湿度随时间波动，便于在控制台上观察到数值变化。"""
    t = time.time() / 60
    return {
        "temperature": round(22 + 4 * math.sin(t), 1),
        "humidity": round(55 + 10 * math.cos(t / 2), 1),
    }


def publish_property(client, params=None):
    global report_count
    report_count += 1
    payload = {
        "id": str(int(time.time() * 1000)),
        "params": params or simulate_params(),
    }
    info = client.publish(PROPERTY_POST_TOPIC, json.dumps(payload), qos=1)
    print(f"[上报 #{report_count}] topic={PROPERTY_POST_TOPIC} params={payload['params']} mid={info.mid}")


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code != 0 and str(reason_code) != "Success":
        print(f"[失败] 连接被拒绝 reason_code={reason_code}")
        client.disconnect()
        return
    print(f"[上线] 已连接 {MQTT_HOST}:{MQTT_PORT} tls={MQTT_TLS} username={USERNAME}")
    client.subscribe(
        [
            (SERVICE_INVOKE_TOPIC, 1),
            (PROPERTY_SET_TOPIC, 1),
            (OTA_NOTIFY_TOPIC, 1),
        ]
    )
    print(f"[订阅] {SERVICE_INVOKE_TOPIC}")
    print(f"[订阅] {PROPERTY_SET_TOPIC}")
    print(f"[订阅] {OTA_NOTIFY_TOPIC}")
    publish_property(client)


def on_disconnect(client, userdata, flags, reason_code, properties=None):
    print(f"[离线] 连接断开 reason_code={reason_code}（平台会将设备标记为 offline）")


def on_publish(client, userdata, mid, reason_code, properties=None):
    print(f"[确认] mid={mid} 已被 Broker 接收（qos1 PUBACK）")


def service_identifier(topic):
    parts = [part for part in topic.split("/") if part]
    if len(parts) >= 7 and parts[0] == "sys" and parts[4] == "service":
        return parts[5]
    return "unknown"


def on_message(client, userdata, message):
    payload_text = message.payload.decode("utf-8", errors="replace")
    print(f"[下行] topic={message.topic} payload={payload_text}")
    request_id = str(int(time.time() * 1000))

    try:
        body = json.loads(payload_text)
        if isinstance(body, dict):
            request_id = str(body.get("request_id") or body.get("id") or request_id)
    except json.JSONDecodeError:
        body = None

    if message.topic == PROPERTY_SET_TOPIC:
        reply_topic = PROPERTY_SET_REPLY_TOPIC
        client.publish(
            reply_topic,
            json.dumps({"id": request_id, "request_id": request_id, "code": 0, "data": {}}),
            qos=1,
        )
        print(f"[应答] {reply_topic}（可选设备侧应答，命令状态不依赖它）")
        params = body.get("params") if isinstance(body, dict) else None
        publish_property(client, params if isinstance(params, dict) else None)
        return

    if message.topic == OTA_NOTIFY_TOPIC:
        task_id = body.get("task_id", "") if isinstance(body, dict) else ""
        if task_id:
            for status, progress in (("downloading", 30), ("installing", 80)):
                client.publish(
                    OTA_PROGRESS_TOPIC,
                    json.dumps({"task_id": task_id, "status": status, "progress": progress}),
                    qos=1,
                )
            client.publish(
                OTA_RESULT_TOPIC,
                json.dumps({"task_id": task_id, "code": 0, "progress": 100, "firmware_version": "demo"}),
                qos=1,
            )
            print(f"[OTA] 已上报升级结果 task_id={task_id}")
        return

    identifier = service_identifier(message.topic)
    reply_topic = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/service/{identifier}/reply"
    client.publish(reply_topic, json.dumps({"id": request_id, "request_id": request_id, "code": 0, "data": {}}), qos=1)
    print(f"[回复] {reply_topic}")


def main():
    global MQTT_PORT
    if not (PRODUCT_KEY and DEVICE_KEY and DEVICE_SECRET):
        raise SystemExit("请通过环境变量设置 PRODUCT_KEY / DEVICE_KEY / DEVICE_SECRET")

    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
    except AttributeError:
        client = mqtt.Client(client_id=CLIENT_ID)
    client.username_pw_set(USERNAME, DEVICE_SECRET)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_publish = on_publish
    client.on_message = on_message

    if MQTT_TLS:
        if "MQTT_PORT" not in os.environ:
            MQTT_PORT = 8883
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
        print("[TLS] 已启用证书校验（Let's Encrypt，系统 CA）")

    print(f"[连接] {MQTT_HOST}:{MQTT_PORT} ...")
    try:
        client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    except OSError as error:
        raise SystemExit(f"[失败] TCP 连接失败 {MQTT_HOST}:{MQTT_PORT}: {error}") from error

    client.loop_start()
    started = time.time()
    try:
        while True:
            time.sleep(REPORT_INTERVAL_SECONDS)
            if client.is_connected():
                publish_property(client)
            if RUN_SECONDS > 0 and time.time() - started >= RUN_SECONDS:
                print(f"[结束] 已运行 {RUN_SECONDS}s，主动断开")
                break
    except KeyboardInterrupt:
        print("[结束] Ctrl+C")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()

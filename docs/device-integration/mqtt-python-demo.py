#!/usr/bin/env python3
import json
import os
import time

import paho.mqtt.client as mqtt


MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
PRODUCT_KEY = os.getenv("PRODUCT_KEY", "pk_demo")
DEVICE_KEY = os.getenv("DEVICE_KEY", "dk_mqtt_demo")
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "DeviceSecret123")
CLIENT_ID = os.getenv("MQTT_CLIENT_ID", DEVICE_KEY)

USERNAME = f"{PRODUCT_KEY}:{DEVICE_KEY}"
PASSWORD = DEVICE_SECRET

SERVICE_INVOKE_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/service/+/invoke"
PROPERTY_SET_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/property/set"
PROPERTY_SET_REPLY_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/property/set_reply"
PROPERTY_POST_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/property/post"


def report_interval_seconds():
    try:
        value = int(os.getenv("REPORT_INTERVAL_SECONDS", "10"))
    except ValueError:
        return 10

    return value if value > 0 else 10


REPORT_INTERVAL_SECONDS = report_interval_seconds()


def create_client():
    try:
        return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
    except AttributeError:
        return mqtt.Client(client_id=CLIENT_ID)


def service_identifier(topic):
    parts = [part for part in topic.split("/") if part]
    if len(parts) >= 7 and parts[0] == "sys" and parts[4] == "service":
        return parts[5]
    return "unknown"


def publish_property(client, params=None):
    payload = {
        "id": str(int(time.time() * 1000)),
        "params": params
        or {
            "temperature": 23.6,
            "humidity": 58,
        },
    }
    client.publish(PROPERTY_POST_TOPIC, json.dumps(payload), qos=1)
    print(f"published property topic={PROPERTY_POST_TOPIC}")


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code != 0 and str(reason_code) != "Success":
        print(f"connect failed reason_code={reason_code}")
        return

    print(f"connected username={USERNAME}")
    client.subscribe(SERVICE_INVOKE_TOPIC, qos=1)
    print(f"subscribed topic={SERVICE_INVOKE_TOPIC}")
    client.subscribe(PROPERTY_SET_TOPIC, qos=1)
    print(f"subscribed topic={PROPERTY_SET_TOPIC}")
    print(f"periodic property report interval={REPORT_INTERVAL_SECONDS}s")

    publish_property(client)


def on_message(client, userdata, message):
    payload_text = message.payload.decode("utf-8", errors="replace")
    print(f"downlink topic={message.topic} payload={payload_text}")
    request_id = str(int(time.time() * 1000))
    params = None

    try:
        body = json.loads(payload_text)
        if isinstance(body, dict):
            request_id = str(body.get("request_id") or body.get("id") or request_id)
            params = body.get("params") if isinstance(body.get("params"), dict) else None
    except json.JSONDecodeError:
        body = None

    if message.topic == PROPERTY_SET_TOPIC:
        reply = {
            "id": request_id,
            "request_id": request_id,
            "code": 0,
            "data": {},
        }
        client.publish(PROPERTY_SET_REPLY_TOPIC, json.dumps(reply), qos=1)
        print(f"replied topic={PROPERTY_SET_REPLY_TOPIC}")
        publish_property(client, params)
        return

    identifier = service_identifier(message.topic)
    reply_topic = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/service/{identifier}/reply"
    reply = {
        "id": request_id,
        "request_id": request_id,
        "code": 0,
        "data": {},
    }
    client.publish(reply_topic, json.dumps(reply), qos=1)
    print(f"replied topic={reply_topic}")


def main():
    client = create_client()
    client.username_pw_set(USERNAME, PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    except OSError as error:
        print(f"tcp connect failed {MQTT_HOST}:{MQTT_PORT}: {error}")
        print("请确认 EMQX 已启动并映射 1883 端口。")
        print("本地可执行: docker compose -f deploy/docker-compose.yml up emqx web")
        raise SystemExit(1) from error

    client.loop_start()
    try:
        while True:
            time.sleep(REPORT_INTERVAL_SECONDS)
            publish_property(client)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()

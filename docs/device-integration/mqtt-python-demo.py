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
PROPERTY_POST_TOPIC = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/property/post"


def create_client():
    try:
        return mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id=CLIENT_ID)
    except AttributeError:
        return mqtt.Client(client_id=CLIENT_ID)


def service_identifier(topic):
    parts = [part for part in topic.split("/") if part]
    if len(parts) >= 7 and parts[0] == "sys" and parts[4] == "service":
        return parts[5]
    return "unknown"


def on_connect(client, userdata, flags, rc):
    if rc != 0:
        print(f"connect failed rc={rc}")
        return

    print(f"connected username={USERNAME}")
    client.subscribe(SERVICE_INVOKE_TOPIC, qos=1)

    payload = {
        "id": str(int(time.time() * 1000)),
        "params": {
            "temperature": 23.6,
            "humidity": 58,
        },
    }
    client.publish(PROPERTY_POST_TOPIC, json.dumps(payload), qos=1)
    print(f"published property topic={PROPERTY_POST_TOPIC}")


def on_message(client, userdata, message):
    payload_text = message.payload.decode("utf-8", errors="replace")
    print(f"command topic={message.topic} payload={payload_text}")

    identifier = service_identifier(message.topic)
    reply_topic = f"/sys/{PRODUCT_KEY}/{DEVICE_KEY}/thing/service/{identifier}/reply"
    reply = {
        "id": str(int(time.time() * 1000)),
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

    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_forever()


if __name__ == "__main__":
    main()

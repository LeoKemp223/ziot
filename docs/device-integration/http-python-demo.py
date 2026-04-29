#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import time
import uuid
from urllib import error, request


BASE_URL = os.getenv("HTTP_DEVICE_API_URL", "http://localhost:3000").rstrip("/")
PRODUCT_KEY = os.getenv("PRODUCT_KEY", "pk_demo")
DEVICE_KEY = os.getenv("DEVICE_KEY", "dk_mqtt_demo")
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "DeviceSecret123")


def body_bytes(payload):
    if payload is None:
        return b""
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def signed_headers(method, path, body):
    timestamp = str(int(time.time() * 1000))
    nonce = f"nonce_{timestamp}_{uuid.uuid4().hex[:12]}"
    body_sha256 = hashlib.sha256(body).hexdigest()
    canonical = "\n".join([method.upper(), path, timestamp, nonce, body_sha256])
    signature = hmac.new(
        DEVICE_SECRET.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return {
        "content-type": "application/json",
        "x-ziot-product-key": PRODUCT_KEY,
        "x-ziot-device-key": DEVICE_KEY,
        "x-ziot-device-secret": DEVICE_SECRET,
        "x-ziot-timestamp": timestamp,
        "x-ziot-nonce": nonce,
        "x-ziot-body-sha256": body_sha256,
        "x-ziot-signature": signature,
    }


def device_request(method, path, payload=None):
    body = body_bytes(payload)
    req = request.Request(
        f"{BASE_URL}{path}",
        data=body if body else None,
        headers=signed_headers(method, path, body),
        method=method,
    )

    try:
        with request.urlopen(req, timeout=5) as response:
            text = response.read().decode("utf-8")
    except error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"request failed {exc.code}: {text}") from exc
    except OSError as exc:
        raise RuntimeError(f"connect failed {BASE_URL}: {exc}") from exc

    envelope = json.loads(text)
    if envelope.get("code") != 0:
        raise RuntimeError(f"request failed: {text}")
    return envelope.get("data")


def report_properties():
    payload = {
        "id": str(int(time.time() * 1000)),
        "params": {
            "temperature": 23.6,
            "humidity": 58,
        },
    }
    data = device_request("POST", "/device-api/v1/properties", payload)
    print(f"reported properties {data}")


def poll_and_reply_commands():
    commands = device_request("GET", "/device-api/v1/commands/pending")
    commands = commands if isinstance(commands, list) else []
    print(f"pending commands={len(commands)}")

    for command in commands:
        request_id = str(command.get("request_id") or "")
        identifier = str(command.get("identifier") or "unknown")
        if not request_id:
            continue

        reply = {
            "code": 0,
            "data": {
                "identifier": identifier,
                "ok": True,
            },
        }
        data = device_request(
            "POST",
            f"/device-api/v1/commands/{request_id}/reply",
            reply,
        )
        print(f"replied command={request_id} {data}")


def main():
    print(f"http device demo base_url={BASE_URL} product_key={PRODUCT_KEY} device_key={DEVICE_KEY}")
    report_properties()
    poll_and_reply_commands()


if __name__ == "__main__":
    main()

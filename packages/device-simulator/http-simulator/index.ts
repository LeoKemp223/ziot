import {
  createHttpCanonicalString,
  sha256Hex,
  signHmacSha256
} from "@ziot/domain";

const baseUrl = process.env.HTTP_DEVICE_API_URL ?? "http://localhost:3000";
const productKey = process.env.PRODUCT_KEY ?? "pk_demo";
const deviceKey = process.env.DEVICE_KEY ?? "dk_mqtt_demo";
const deviceSecret = process.env.DEVICE_SECRET ?? "DeviceSecret123";

function signedHeaders(method: string, path: string, body: string) {
  const timestamp = String(Date.now());
  const nonce = `nonce_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const bodySha256 = sha256Hex(body);
  const canonical = createHttpCanonicalString({
    method,
    path,
    timestamp,
    nonce,
    bodySha256
  });

  return {
    "content-type": "application/json",
    "x-ziot-product-key": productKey,
    "x-ziot-device-key": deviceKey,
    "x-ziot-device-secret": deviceSecret,
    "x-ziot-timestamp": timestamp,
    "x-ziot-nonce": nonce,
    "x-ziot-body-sha256": bodySha256,
    "x-ziot-signature": signHmacSha256(deviceSecret, canonical)
  };
}

async function request(path: string, init: { method: string; body?: unknown }) {
  const body = init.body === undefined ? "" : JSON.stringify(init.body);
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: signedHeaders(init.method, path, body),
    ...(body ? { body } : {})
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as { code: number; message: string; data: unknown }) : null;

  if (!response.ok || json?.code !== 0) {
    throw new Error(`request failed ${response.status}: ${text}`);
  }

  return json.data;
}

async function main() {
  const property = await request("/device-api/v1/properties", {
    method: "POST",
    body: {
      id: `${Date.now()}`,
      params: {
        temperature: 23.6,
        humidity: 58
      }
    }
  });
  console.log("reported properties", property);

  const commands = (await request("/device-api/v1/commands/pending", {
    method: "GET"
  })) as Array<{ request_id: string; identifier: string }>;
  console.log(`pending commands=${commands.length}`);

  for (const command of commands) {
    const reply = await request(
      `/device-api/v1/commands/${encodeURIComponent(command.request_id)}/reply`,
      {
        method: "POST",
        body: {
          code: 0,
          data: {
            identifier: command.identifier,
            ok: true
          }
        }
      }
    );
    console.log(`replied command=${command.request_id}`, reply);
  }

  const otaTask = (await request("/device-api/v1/ota/tasks/current", {
    method: "GET"
  })) as null | { task_id: string; firmware?: { version?: string } };

  if (!otaTask) {
    console.log("current ota task=none");
    return;
  }

  console.log(`current ota task=${otaTask.task_id}`);
  for (const [status, progress] of [
    ["downloading", 30],
    ["installing", 80],
    ["success", 100]
  ] as const) {
    const otaProgress = await request(
      `/device-api/v1/ota/tasks/${encodeURIComponent(otaTask.task_id)}/progress`,
      {
        method: "POST",
        body: {
          status,
          progress,
          firmware_version: otaTask.firmware?.version
        }
      }
    );
    console.log(`reported ota ${status}`, otaProgress);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

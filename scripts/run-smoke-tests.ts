import crypto from "node:crypto";
import { createRequire } from "node:module";

const requireFromSimulator = createRequire(
  new URL("../packages/device-simulator/package.json", import.meta.url)
);
const mqtt = requireFromSimulator("mqtt") as any;

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MQTT_BROKER_URL =
  process.env.MQTT_BROKER_URL ??
  `mqtt://${process.env.MQTT_HOST ?? "localhost"}:${process.env.MQTT_PORT ?? "1883"}`;
const ADMIN_ACCOUNT = process.env.ADMIN_ACCOUNT ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin123456";
const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? "20000");

type Envelope<T> = {
  code: number;
  message: string;
  data: T;
};

type CookieJar = Map<string, string>;

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function logStep(message: string) {
  console.log(`ok - ${message}`);
}

function rememberCookies(headers: Headers, jar: CookieJar) {
  const setCookies =
    typeof (headers as any).getSetCookie === "function"
      ? (headers as any).getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];

  for (const header of setCookies) {
    for (const part of header.split(/,(?=\s*[^;,]+=)/)) {
      const cookie = part.split(";")[0]?.trim();
      if (!cookie) {
        continue;
      }
      const separator = cookie.indexOf("=");
      if (separator > 0) {
        jar.set(cookie.slice(0, separator), cookie.slice(separator + 1));
      }
    }
  }
}

function cookieHeader(jar: CookieJar) {
  return Array.from(jar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown; jar?: CookieJar } = {}
) {
  const headers = new Headers(init.headers);
  const jar = init.jar;
  let body = init.body;

  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  if (jar && jar.size > 0) {
    headers.set("cookie", cookieHeader(jar));
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    body
  });
  if (jar) {
    rememberCookies(response.headers, jar);
  }

  const text = await response.text();
  const envelope = text ? (JSON.parse(text) as Envelope<T>) : null;

  if (!response.ok || envelope?.code !== 0) {
    throw new Error(`${init.method ?? "GET"} ${path} failed ${response.status}: ${text}`);
  }

  return envelope.data;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signedDeviceHeaders(
  method: string,
  path: string,
  body: string,
  device: { productKey: string; deviceKey: string; deviceSecret: string }
) {
  const timestamp = String(Date.now());
  const nonce = `smoke_${timestamp}_${crypto.randomBytes(8).toString("hex")}`;
  const bodySha256 = sha256Hex(body);
  const canonical = [method.toUpperCase(), path, timestamp, nonce, bodySha256].join("\n");
  const signature = crypto
    .createHmac("sha256", device.deviceSecret)
    .update(canonical)
    .digest("hex");

  return {
    "content-type": "application/json",
    "x-ziot-product-key": device.productKey,
    "x-ziot-device-key": device.deviceKey,
    "x-ziot-device-secret": device.deviceSecret,
    "x-ziot-timestamp": timestamp,
    "x-ziot-nonce": nonce,
    "x-ziot-body-sha256": bodySha256,
    "x-ziot-signature": signature
  };
}

async function deviceApi<T>(
  method: string,
  path: string,
  device: { productKey: string; deviceKey: string; deviceSecret: string },
  payload?: unknown
) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: signedDeviceHeaders(method, path, body, device),
    ...(body ? { body } : {})
  });
  const text = await response.text();
  const envelope = text ? (JSON.parse(text) as Envelope<T>) : null;

  if (!response.ok || envelope?.code !== 0) {
    throw new Error(`${method} ${path} failed ${response.status}: ${text}`);
  }

  return envelope.data;
}

async function waitFor<T>(
  name: string,
  action: () => Promise<T | null | undefined | false>,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      const value = await action();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  throw new Error(`timeout waiting for ${name}${lastError instanceof Error ? `: ${lastError.message}` : ""}`);
}

async function connectMqttDevice(input: {
  productKey: string;
  deviceKey: string;
  deviceSecret: string;
}) {
  const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `${input.deviceKey}_${Date.now()}`,
    username: `${input.productKey}:${input.deviceKey}`,
    password: input.deviceSecret,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 8000
  });

  await new Promise<void>((resolveConnect, rejectConnect) => {
    const timer = setTimeout(() => rejectConnect(new Error("mqtt connect timeout")), 9000);
    client.once("connect", () => {
      clearTimeout(timer);
      resolveConnect();
    });
    client.once("error", (error: Error) => {
      clearTimeout(timer);
      rejectConnect(error);
    });
  });

  return client;
}

async function publishMqtt(client: any, topic: string, payload: unknown) {
  await new Promise<void>((resolvePublish, rejectPublish) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error: Error | null) => {
      if (error) {
        rejectPublish(error);
        return;
      }
      resolvePublish();
    });
  });
}

async function subscribeMqtt(client: any, topic: string) {
  await new Promise<void>((resolveSubscribe, rejectSubscribe) => {
    client.subscribe(topic, { qos: 1 }, (error: Error | null) => {
      if (error) {
        rejectSubscribe(error);
        return;
      }
      resolveSubscribe();
    });
  });
}

async function main() {
  const stamp = Date.now();
  const adminJar: CookieJar = new Map();
  const operatorJar: CookieJar = new Map();

  await api("/api/v1/health");
  logStep("health endpoint");

  await api("/api/v1/auth/login", {
    method: "POST",
    jar: adminJar,
    json: {
      account: ADMIN_ACCOUNT,
      password: ADMIN_PASSWORD
    }
  });
  logStep("admin login");

  const roles = await api<Array<{ id: string; code: string }>>("/api/v1/roles", {
    jar: adminJar
  });
  const memberRole = roles.find((role) => role.code === "org_member") ?? roles[0];
  if (!memberRole) {
    throw new Error("no role available for registration smoke test");
  }

  const invitation = await api<{ code: string }>("/api/v1/invitations", {
    method: "POST",
    jar: adminJar,
    json: {
      role_id: memberRole.id,
      max_uses: 1
    }
  });
  await api("/api/v1/auth/register", {
    method: "POST",
    jar: operatorJar,
    json: {
      account: `smoke_${stamp}@example.com`,
      password: "Smoke123456",
      display_name: "Smoke Operator",
      invitation_code: invitation.code
    }
  });
  logStep("invitation registration");

  const product = await api<{
    id: string;
    product_key: string;
  }>("/api/v1/products", {
    method: "POST",
    jar: adminJar,
    json: {
      name: `Smoke Product ${stamp}`,
      product_key: `pk_smoke_${stamp}`,
      protocols: ["mqtt", "http"],
      thing_model: {
        version: "1.0",
        properties: [],
        events: [],
        services: []
      }
    }
  });
  logStep("product creation");

  const mqttDevice = await api<{
    id: string;
    device_key: string;
    device_secret: string;
  }>("/api/v1/devices", {
    method: "POST",
    jar: adminJar,
    json: {
      product_id: product.id,
      name: `Smoke MQTT Device ${stamp}`,
      device_key: `dk_smoke_mqtt_${stamp}`
    }
  });
  const httpDevice = await api<{
    id: string;
    device_key: string;
    device_secret: string;
  }>("/api/v1/devices", {
    method: "POST",
    jar: adminJar,
    json: {
      product_id: product.id,
      name: `Smoke HTTP Device ${stamp}`,
      device_key: `dk_smoke_http_${stamp}`
    }
  });
  logStep("device creation");

  const mqttClient = await connectMqttDevice({
    productKey: product.product_key,
    deviceKey: mqttDevice.device_key,
    deviceSecret: mqttDevice.device_secret
  });
  const serviceTopic = `/sys/${product.product_key}/${mqttDevice.device_key}/thing/service/+/invoke`;
  await subscribeMqtt(mqttClient, serviceTopic);
  mqttClient.on("message", (topic: string, payload: Buffer) => {
    const parts = topic.split("/").filter(Boolean);
    const identifier = parts[5] ?? "unknown";
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(payload.toString()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    void publishMqtt(
      mqttClient,
      `/sys/${product.product_key}/${mqttDevice.device_key}/thing/service/${identifier}/reply`,
      {
        id: body.request_id ?? body.id,
        request_id: body.request_id ?? body.id,
        code: 0,
        data: { ok: true, identifier }
      }
    );
  });
  logStep("mqtt connect");

  await publishMqtt(
    mqttClient,
    `/sys/${product.product_key}/${mqttDevice.device_key}/thing/property/post`,
    {
      id: `smoke_${stamp}`,
      params: {
        temperature: 24.5,
        humidity: 60
      }
    }
  );
  await waitFor("mqtt property shadow", async () => {
    const shadow = await api<{ reported: Record<string, unknown> }>(
      `/api/v1/devices/${mqttDevice.id}/shadow`,
      { jar: adminJar }
    );
    return shadow.reported?.temperature === 24.5 ? shadow : null;
  });
  logStep("mqtt property report");

  const command = await api<{ id: string; status: string }>(
    `/api/v1/devices/${mqttDevice.id}/commands`,
    {
      method: "POST",
      jar: adminJar,
      json: {
        kind: "service",
        identifier: "reboot",
        params: {
          delay: 1
        },
        timeout_ms: 15000
      }
    }
  );
  await waitFor("command success", async () => {
    const current = await api<{ status: string }>(`/api/v1/commands/${command.id}`, {
      jar: adminJar
    });
    return current.status === "success" ? current : null;
  });
  logStep("command control");

  await deviceApi(
    "POST",
    "/device-api/v1/properties",
    {
      productKey: product.product_key,
      deviceKey: httpDevice.device_key,
      deviceSecret: httpDevice.device_secret
    },
    {
      id: `http_${stamp}`,
      params: {
        voltage: 3.3
      }
    }
  );
  logStep("http property report");

  const firmware = await api<{ id: string }>("/api/v1/firmwares", {
    method: "POST",
    jar: adminJar,
    json: {
      product_id: product.id,
      version: `1.0.${stamp}`,
      file_url: `https://example.com/firmwares/smoke-${stamp}.bin`,
      file_size: 1024,
      sha256: sha256Hex(`smoke-${stamp}`)
    }
  });
  const otaTask = await api<{ id: string }>("/api/v1/ota/tasks", {
    method: "POST",
    jar: adminJar,
    json: {
      firmware_id: firmware.id,
      name: `Smoke OTA ${stamp}`,
      strategy: {
        target_type: "devices",
        device_ids: [httpDevice.id]
      }
    }
  });
  await api(`/api/v1/ota/tasks/${otaTask.id}/start`, {
    method: "POST",
    jar: adminJar
  });
  const currentOta = await deviceApi<{ task_id: string }>(
    "GET",
    "/device-api/v1/ota/tasks/current",
    {
      productKey: product.product_key,
      deviceKey: httpDevice.device_key,
      deviceSecret: httpDevice.device_secret
    }
  );
  await deviceApi(
    "POST",
    `/device-api/v1/ota/tasks/${currentOta.task_id}/progress`,
    {
      productKey: product.product_key,
      deviceKey: httpDevice.device_key,
      deviceSecret: httpDevice.device_secret
    },
    {
      status: "success",
      progress: 100,
      firmware_version: `1.0.${stamp}`
    }
  );
  logStep("ota progress");

  mqttClient.end(true);
  console.log("smoke tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

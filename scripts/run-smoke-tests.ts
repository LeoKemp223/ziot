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
const ADMIN_ACCOUNT = process.env.ADMIN_ACCOUNT ?? "13800000001";
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
  const registerAccount = `139${String(stamp % 100_000_000).padStart(8, "0")}`;
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

  const invitations = await api<Array<{ code: string }>>("/api/v1/invitations", {
    method: "POST",
    jar: adminJar,
    json: {
      role_id: memberRole.id,
      count: 2,
      max_uses: 1
    }
  });
  if (invitations.length !== 2) {
    throw new Error(`invitation batch expected 2 codes, got ${invitations.length}`);
  }
  await api("/api/v1/auth/register", {
    method: "POST",
    jar: operatorJar,
    json: {
      account: registerAccount,
      password: "Smoke123456",
      display_name: "Smoke Operator",
      invitation_code: invitations[0]?.code ?? ""
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
      protocols: ["mqtt"]
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

  // App 全链路:控制台查看设备永久二维码 -> App 注册/登录 -> 扫码绑定 -> 控制 -> 读状态 -> 解绑
  const appBindingCode = await api<{
    device_id: string;
    code: string;
    qr_data_url: string;
    qr_content: string;
  }>(`/api/v1/devices/${mqttDevice.id}/binding-code`, {
    jar: adminJar
  });
  if (!/^BD[2-9A-HJ-NP-Z]{16}$/.test(appBindingCode.code)) {
    throw new Error(`unexpected binding code format: ${appBindingCode.code}`);
  }
  if (!appBindingCode.qr_data_url.startsWith("data:image/png;base64,")) {
    throw new Error("binding qr data url missing");
  }

  const appPhone = `138${String((stamp + 1) % 100_000_000).padStart(8, "0")}`;
  const appSession = await api<{
    user: { id: string; phone: string };
    access_token: string;
    refresh_token: string;
  }>("/api/v1/app/auth/register", {
    method: "POST",
    json: {
      phone: appPhone,
      password: "Smoke123456",
      nickname: "Smoke App User"
    }
  });
  const appAuth = { authorization: `Bearer ${appSession.access_token}` };
  await api<{ user: { phone: string } }>("/api/v1/app/auth/login", {
    method: "POST",
    json: { phone: appPhone, password: "Smoke123456" }
  });
  logStep("app register + login");

  const boundDevice = await api<{ device_id: string; online_status: string }>(
    "/api/v1/app/devices/bind",
    {
      method: "POST",
      headers: appAuth,
      json: { code: appBindingCode.code }
    }
  );
  if (boundDevice.device_id !== mqttDevice.id) {
    throw new Error(`app bind device mismatch: ${boundDevice.device_id}`);
  }

  const appDevices = await api<{ items: Array<{ device_id: string; alias: string | null }> }>(
    "/api/v1/app/devices",
    { headers: appAuth }
  );
  if (!appDevices.items.some((item) => item.device_id === mqttDevice.id)) {
    throw new Error("app device list missing bound device");
  }
  logStep("app bind + device list");

  const appSyncCommand = await api<{ id: string; status: string }>(
    `/api/v1/app/devices/${mqttDevice.id}/commands:sync`,
    {
      method: "POST",
      headers: appAuth,
      json: {
        kind: "service",
        identifier: "reboot",
        params: {},
        timeout_ms: 15000
      }
    }
  );
  if (appSyncCommand.status !== "success") {
    throw new Error(`app sync command status: ${appSyncCommand.status}`);
  }

  const appShadow = await api<{ reported: Record<string, unknown> }>(
    `/api/v1/app/devices/${mqttDevice.id}/shadow`,
    { headers: appAuth }
  );
  if (appShadow.reported?.temperature !== 24.5) {
    throw new Error(`app shadow reported: ${JSON.stringify(appShadow.reported)}`);
  }
  logStep("app sync control + shadow");

  // 永久码可多用户复用:第二个 App 用户扫同一张码也能绑定(家庭共享)
  const secondAppSession = await api<{
    access_token: string;
  }>("/api/v1/app/auth/register", {
    method: "POST",
    json: {
      phone: `137${String((stamp + 2) % 100_000_000).padStart(8, "0")}`,
      password: "Smoke123456"
    }
  });
  const sharedBind = await api<{ device_id: string }>(
    "/api/v1/app/devices/bind",
    {
      method: "POST",
      headers: { authorization: `Bearer ${secondAppSession.access_token}` },
      json: { code: appBindingCode.code }
    }
  );
  if (sharedBind.device_id !== mqttDevice.id) {
    throw new Error(`shared bind device mismatch: ${sharedBind.device_id}`);
  }

  // 轮换后旧码立即失效(400001),新码可重新绑定
  const rotated = await api<{ code: string }>(
    `/api/v1/devices/${mqttDevice.id}/binding-code`,
    { method: "POST", jar: adminJar }
  );
  const oldCodeResponse = await fetch(`${BASE_URL}/api/v1/app/devices/bind`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secondAppSession.access_token}`
    },
    body: JSON.stringify({ code: appBindingCode.code })
  });
  const oldCodeBody = (await oldCodeResponse.json()) as Envelope<unknown>;
  if (oldCodeResponse.status !== 400 || oldCodeBody.code !== 400001) {
    throw new Error(
      `rotated-away code expected 400/400001, got ${oldCodeResponse.status}/${oldCodeBody.code}`
    );
  }
  await api("/api/v1/app/devices/bind", {
    method: "POST",
    headers: appAuth,
    json: { code: rotated.code }
  });

  await api(`/api/v1/app/devices/${mqttDevice.id}`, {
    method: "DELETE",
    headers: appAuth
  });
  const appDevicesAfterUnbind = await api<{
    items: Array<{ device_id: string }>;
  }>("/api/v1/app/devices", { headers: appAuth });
  if (appDevicesAfterUnbind.items.some((item) => item.device_id === mqttDevice.id)) {
    throw new Error("app device list still contains unbound device");
  }
  logStep("app permanent code sharing + rotate + unbind");

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

  // 设备侧先订阅 OTA 通知,再启动任务,验证 notify -> result 的 MQTT 全链路
  const otaNotifyTopic = `/ota/${product.product_key}/${mqttDevice.device_key}/upgrade/notify`;
  await subscribeMqtt(mqttClient, otaNotifyTopic);
  let otaNotifyTaskId = "";
  mqttClient.on("message", (topic: string, payload: Buffer) => {
    if (topic !== otaNotifyTopic) {
      return;
    }
    try {
      otaNotifyTaskId = String(
        (JSON.parse(payload.toString()) as { task_id?: string }).task_id ?? ""
      );
    } catch {
      otaNotifyTaskId = "";
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
        device_ids: [mqttDevice.id]
      }
    }
  });
  await api(`/api/v1/ota/tasks/${otaTask.id}/start`, {
    method: "POST",
    jar: adminJar
  });
  const notifiedTaskId = await waitFor("ota notify", async () =>
    otaNotifyTaskId ? otaNotifyTaskId : null
  );
  if (notifiedTaskId !== otaTask.id) {
    throw new Error(
      `ota notify task mismatch: ${notifiedTaskId} !== ${otaTask.id}`
    );
  }

  await publishMqtt(
    mqttClient,
    `/ota/${product.product_key}/${mqttDevice.device_key}/upgrade/result`,
    {
      task_id: otaTask.id,
      code: 0,
      firmware_version: `1.0.${stamp}`
    }
  );
  await waitFor("ota task finished", async () => {
    const task = await api<{ status: string; record_counts: { success: number } }>(
      `/api/v1/ota/tasks/${otaTask.id}`,
      { jar: adminJar }
    );
    return task.status === "finished" && task.record_counts.success > 0
      ? task
      : null;
  });
  logStep("ota notify + result");

  mqttClient.end(true);
  console.log("smoke tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

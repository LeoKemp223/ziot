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
const CONNECTIONS = Number(process.env.SMOKE_MQTT_CONNECTIONS ?? "100");
const MESSAGES_PER_SECOND = Number(process.env.SMOKE_MESSAGES_PER_SECOND ?? "5");
const DURATION_SECONDS = Number(process.env.SMOKE_DURATION_SECONDS ?? "300");
const COMMANDS = Number(process.env.SMOKE_COMMANDS ?? "20");

type Envelope<T> = {
  code: number;
  message: string;
  data: T;
};

type CookieJar = Map<string, string>;

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
      const separator = cookie?.indexOf("=") ?? -1;
      if (cookie && separator > 0) {
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
  let body = init.body;

  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  if (init.jar && init.jar.size > 0) {
    headers.set("cookie", cookieHeader(init.jar));
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    body
  });
  if (init.jar) {
    rememberCookies(response.headers, init.jar);
  }

  const text = await response.text();
  const envelope = text ? (JSON.parse(text) as Envelope<T>) : null;

  if (!response.ok || envelope?.code !== 0) {
    throw new Error(`${init.method ?? "GET"} ${path} failed ${response.status}: ${text}`);
  }

  return envelope.data;
}

async function connectMqttDevice(input: {
  productKey: string;
  deviceKey: string;
  deviceSecret: string;
  index: number;
}) {
  const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `${input.deviceKey}_${Date.now()}_${input.index}`,
    username: `${input.productKey}:${input.deviceKey}`,
    password: input.deviceSecret,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 10000
  });

  await new Promise<void>((resolveConnect, rejectConnect) => {
    const timer = setTimeout(() => rejectConnect(new Error("mqtt connect timeout")), 12000);
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

async function publish(client: any, topic: string, payload: unknown) {
  await new Promise<void>((resolvePublish, rejectPublish) => {
    client.publish(topic, JSON.stringify(payload), { qos: 0 }, (error: Error | null) => {
      if (error) {
        rejectPublish(error);
        return;
      }
      resolvePublish();
    });
  });
}

async function subscribe(client: any, topic: string) {
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

async function waitForCommandSuccess(jar: CookieJar, commandId: string) {
  const start = Date.now();

  while (Date.now() - start < 15000) {
    const command = await api<{ status: string }>(`/api/v1/commands/${commandId}`, {
      jar
    });
    if (command.status === "success") {
      return;
    }
    if (["failed", "timeout", "cancelled"].includes(command.status)) {
      throw new Error(`command ${commandId} ended with ${command.status}`);
    }
    await sleep(500);
  }

  throw new Error(`command ${commandId} did not finish`);
}

async function main() {
  if (CONNECTIONS < 1 || MESSAGES_PER_SECOND < 1 || DURATION_SECONDS < 1) {
    throw new Error("pressure smoke parameters must be positive");
  }

  const stamp = Date.now();
  const jar: CookieJar = new Map();
  const clients: any[] = [];

  await api("/api/v1/auth/login", {
    method: "POST",
    jar,
    json: {
      account: ADMIN_ACCOUNT,
      password: ADMIN_PASSWORD
    }
  });

  const product = await api<{ id: string; product_key: string }>("/api/v1/products", {
    method: "POST",
    jar,
    json: {
      name: `Pressure Product ${stamp}`,
      product_key: `pk_pressure_${stamp}`,
      protocols: ["mqtt"]
    }
  });

  const devices: Array<{ id: string; device_key: string; device_secret: string }> = [];
  for (let index = 0; index < CONNECTIONS; index += 1) {
    const device = await api<{
      id: string;
      device_key: string;
      device_secret: string;
    }>("/api/v1/devices", {
      method: "POST",
      jar,
      json: {
        product_id: product.id,
        name: `Pressure Device ${stamp}-${index}`,
        device_key: `dk_pressure_${stamp}_${index}`
      }
    });
    devices.push(device);
  }
  console.log(`created devices=${devices.length}`);

  for (let index = 0; index < devices.length; index += 1) {
    const device = devices[index];
    const client = await connectMqttDevice({
      productKey: product.product_key,
      deviceKey: device.device_key,
      deviceSecret: device.device_secret,
      index
    });
    clients.push(client);

    if (index < COMMANDS) {
      const serviceTopic = `/sys/${product.product_key}/${device.device_key}/thing/service/+/invoke`;
      await subscribe(client, serviceTopic);
      client.on("message", (topic: string, payload: Buffer) => {
        const parts = topic.split("/").filter(Boolean);
        const identifier = parts[5] ?? "unknown";
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(payload.toString()) as Record<string, unknown>;
        } catch {
          body = {};
        }
        void publish(
          client,
          `/sys/${product.product_key}/${device.device_key}/thing/service/${identifier}/reply`,
          {
            id: body.request_id ?? body.id,
            request_id: body.request_id ?? body.id,
            code: 0,
            data: { ok: true }
          }
        );
      });
    }
  }
  console.log(`connected mqtt=${clients.length}`);

  const totalMessages = MESSAGES_PER_SECOND * DURATION_SECONDS;
  const intervalMs = Math.max(1, Math.floor(1000 / MESSAGES_PER_SECOND));
  const startedAt = Date.now();

  for (let index = 0; index < totalMessages; index += 1) {
    const device = devices[index % devices.length];
    const client = clients[index % clients.length];
    await publish(
      client,
      `/sys/${product.product_key}/${device.device_key}/thing/property/post`,
      {
        id: `pressure_${stamp}_${index}`,
        params: {
          sequence: index,
          temperature: 20 + (index % 10)
        }
      }
    );

    const nextDue = startedAt + (index + 1) * intervalMs;
    const delay = nextDue - Date.now();
    if (delay > 0) {
      await sleep(delay);
    }
  }
  console.log(`published messages=${totalMessages}`);

  await api("/api/v1/auth/refresh", {
    method: "POST",
    jar
  });

  for (let index = 0; index < Math.min(COMMANDS, devices.length); index += 1) {
    const command = await api<{ id: string }>(
      `/api/v1/devices/${devices[index].id}/commands`,
      {
        method: "POST",
        jar,
        json: {
          kind: "service",
          identifier: "ping",
          params: { index },
          timeout_ms: 15000
        }
      }
    );
    await waitForCommandSuccess(jar, command.id);
  }
  console.log(`commands succeeded=${Math.min(COMMANDS, devices.length)}`);

  for (const client of clients) {
    client.end(true);
  }
  console.log("pressure smoke completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

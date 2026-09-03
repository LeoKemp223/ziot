import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  mergeReportedShadow,
  parseMqttUsername,
  parseTopic,
  signHmacSha256,
  type MqttUsername
} from "@ziot/domain";
import {
  markDeviceOfflineInCache,
  markDeviceOnlineInCache
} from "@/lib/devices/online-status";
import { publishDeviceEvent } from "@/lib/events/device-events";

type Db = { [key: string]: any };

export type MqttDecision = {
  result: "allow" | "deny";
  reason?: string;
};

type DeviceRecord = {
  id: string;
  org_id: string;
  product_id: string;
  device_key: string;
  device_secret_hash: string;
  status: string;
  online_status: string;
  product: {
    id: string;
    product_key: string;
  };
};

type MqttReportInput = {
  topic: unknown;
  payload: unknown;
};

type MqttOtaProgressInput = {
  topic: unknown;
  payload: unknown;
};

function deny(reason: string): MqttDecision {
  return { result: "deny", reason };
}

function allow(): MqttDecision {
  return { result: "allow" };
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function findActiveDeviceByUsername(
  db: Db,
  username: MqttUsername
): Promise<DeviceRecord | null> {
  return db.device.findFirst({
    where: {
      device_key: username.deviceKey,
      deleted_at: null,
      product: {
        product_key: username.productKey,
        deleted_at: null
      }
    },
    include: { product: true }
  });
}

async function findActiveDeviceByTopic(
  db: Db,
  topic: string
): Promise<DeviceRecord | null> {
  const parsed = parseTopic(topic);

  if (!parsed) {
    return null;
  }

  return db.device.findFirst({
    where: {
      device_key: parsed.deviceKey,
      deleted_at: null,
      product: {
        product_key: parsed.productKey,
        deleted_at: null
      }
    },
    include: { product: true }
  });
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      try {
        return JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Record<
          string,
          unknown
        >;
      } catch {
        return { raw: payload };
      }
    }
  }

  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
}

function reportType(messageType: string) {
  if (messageType === "property.post") {
    return "property";
  }

  if (messageType === "event.post") {
    return "event";
  }

  return "log";
}

function logLevel(payload: Record<string, unknown>) {
  return ["debug", "info", "warn", "error"].includes(String(payload.level))
    ? String(payload.level)
    : "info";
}

function parseClientUsername(username: unknown): MqttUsername | null {
  return typeof username === "string" ? parseMqttUsername(username) : null;
}

async function verifyMqttPassword(
  password: string,
  rawUsername: string,
  passwordHash: string
): Promise<boolean> {
  if (await bcrypt.compare(password, passwordHash)) {
    return true;
  }

  const legacyHmacPassword = signHmacSha256(password, rawUsername);
  return bcrypt.compare(legacyHmacPassword, passwordHash);
}

export async function authenticateMqttClient(
  db: Db,
  input: {
    username: unknown;
    password: unknown;
  }
): Promise<MqttDecision> {
  const rawUsername = typeof input.username === "string" ? input.username : "";
  const username = parseClientUsername(input.username);
  const password = typeof input.password === "string" ? input.password : "";

  if (!username || !password) {
    return deny("invalid credentials");
  }

  const device = await findActiveDeviceByUsername(db, username);

  if (!device || device.status !== "active") {
    return deny("设备不存在 or disabled");
  }

  const verified = await verifyMqttPassword(
    password,
    rawUsername,
    device.device_secret_hash
  );

  return verified ? allow() : deny("invalid credentials");
}

function topicMatchesOwnDevice(
  topic: string,
  username: MqttUsername,
  allowedMessageTypes: Set<string>
): boolean {
  const parsed = parseTopic(topic);

  if (!parsed) {
    return false;
  }

  return (
    parsed.productKey === username.productKey &&
    parsed.deviceKey === username.deviceKey &&
    allowedMessageTypes.has(parsed.messageType)
  );
}

function canSubscribe(topic: string, username: MqttUsername): boolean {
  const ownPropertySetTopic = `/sys/${username.productKey}/${username.deviceKey}/thing/property/set`;
  const ownServicePrefix = `/sys/${username.productKey}/${username.deviceKey}/thing/service/`;
  const ownOtaPrefix = `/ota/${username.productKey}/${username.deviceKey}/upgrade/`;

  return (
    topic === ownPropertySetTopic ||
    topic === `${ownServicePrefix}+/invoke` ||
    topic === `${ownServicePrefix}#` ||
    topic === `${ownOtaPrefix}notify` ||
    topic === `${ownOtaPrefix}#`
  );
}

export async function authorizeMqttAction(
  db: Db,
  input: {
    username: unknown;
    action: unknown;
    topic: unknown;
  }
): Promise<MqttDecision> {
  const username = parseClientUsername(input.username);
  const action = typeof input.action === "string" ? input.action.toLowerCase() : "";
  const topic = typeof input.topic === "string" ? input.topic : "";

  if (!username || !topic) {
    return deny("invalid acl request");
  }

  const device = await findActiveDeviceByUsername(db, username);

  if (!device || device.status !== "active") {
    return deny("设备不存在 or disabled");
  }

  if (action === "publish") {
    return topicMatchesOwnDevice(
      topic,
      username,
      new Set([
        "property.post",
        "property.set_reply",
        "event.post",
        "log.post",
        "service.reply",
        "upgrade.progress",
        "upgrade.result"
      ])
    )
      ? allow()
      : deny("topic denied");
  }

  if (action === "subscribe") {
    return canSubscribe(topic, username) ? allow() : deny("topic denied");
  }

  return deny("unsupported action");
}

export async function recordMqttWebhookEvent(
  db: Db,
  input: {
    event: unknown;
    username: unknown;
    clientId?: unknown;
    connectedAt?: Date;
  }
): Promise<MqttDecision> {
  const username = parseClientUsername(input.username);
  const event = typeof input.event === "string" ? input.event : "";

  if (!username) {
    return deny("invalid webhook request");
  }

  const device = await findActiveDeviceByUsername(db, username);

  if (!device) {
    return deny("设备不存在");
  }

  const now = input.connectedAt ?? new Date();
  const isConnected = event === "client.connected";
  const isDisconnected = event === "client.disconnected";

  if (!isConnected && !isDisconnected) {
    return allow();
  }

  await db.device.update({
    where: { id: device.id },
    data: isConnected
      ? {
          online_status: "online",
          last_online_at: now,
          last_heartbeat_at: now
        }
      : {
          online_status: "offline",
          last_offline_at: now
        }
  });

  // 状态真正翻转才推事件(重复 connect 不刷屏)
  const nextStatus = isConnected ? "online" : "offline";
  if (device.online_status !== nextStatus) {
    await publishDeviceEvent({
      type: "device.status.changed",
      device_id: device.id,
      online_status: nextStatus,
      occurred_at: now.toISOString()
    });
  }

  if (isConnected) {
    await markDeviceOnlineInCache(device.id);
  } else {
    await markDeviceOfflineInCache(device.id);
  }

  await db.deviceLog.create({
    data: {
      id: id("dlg"),
      org_id: device.org_id,
      product_id: device.product_id,
      device_id: device.id,
      type: "lifecycle",
      level: "info",
      content: {
        event,
        client_id: typeof input.clientId === "string" ? input.clientId : null
      },
      occurred_at: now
    }
  });

  return allow();
}

export async function recordMqttReport(
  db: Db,
  input: MqttReportInput
): Promise<MqttDecision> {
  const topic = typeof input.topic === "string" ? input.topic : "";
  const parsed = parseTopic(topic);

  if (
    !parsed ||
    !["property.post", "event.post", "log.post"].includes(parsed.messageType)
  ) {
    return deny("invalid report topic");
  }

  const device = await findActiveDeviceByTopic(db, topic);

  if (!device) {
    return deny("设备不存在");
  }

  const payload = parsePayload(input.payload);
  const now = new Date();
  const type = reportType(parsed.messageType);

  if (parsed.messageType === "property.post") {
    const params =
      typeof payload.params === "object" &&
      payload.params !== null &&
      !Array.isArray(payload.params)
        ? (payload.params as Record<string, unknown>)
        : payload;
    const shadow = await db.deviceShadow.findUnique({
      where: { device_id: device.id }
    });

    if (shadow) {
      const merged = mergeReportedShadow(
        {
          reported:
            typeof shadow.reported === "object" &&
            shadow.reported !== null &&
            !Array.isArray(shadow.reported)
              ? (shadow.reported as Record<string, unknown>)
              : {},
          desired:
            typeof shadow.desired === "object" &&
            shadow.desired !== null &&
            !Array.isArray(shadow.desired)
              ? (shadow.desired as Record<string, unknown>)
              : {},
          version: Number(shadow.version)
        },
        params
      );

      const updatedShadow = await db.deviceShadow.update({
        where: { device_id: device.id },
        data: {
          reported: merged.reported,
          version: { increment: 1 }
        }
      });

      if (updatedShadow) {
        await publishDeviceEvent({
          type: "device.shadow.updated",
          device_id: device.id,
          reported: updatedShadow.reported ?? merged.reported,
          version: Number(updatedShadow.version),
          updated_at:
            updatedShadow.updated_at instanceof Date
              ? updatedShadow.updated_at.toISOString()
              : new Date().toISOString()
        });
      }
    }
  }

  await db.device.update({
    where: { id: device.id },
    data: { last_heartbeat_at: now }
  });

  await db.deviceLog.create({
    data: {
      id: id("dlg"),
      org_id: device.org_id,
      product_id: device.product_id,
      device_id: device.id,
      type,
      level: type === "log" ? logLevel(payload) : "info",
      content: {
        topic,
        payload
      },
      occurred_at: now
    }
  });

  return allow();
}

export async function parseMqttOtaProgressInput(input: MqttOtaProgressInput) {
  const topic = typeof input.topic === "string" ? input.topic : "";
  const parsed = parseTopic(topic);

  if (
    !parsed ||
    parsed.namespace !== "ota" ||
    !["upgrade.progress", "upgrade.result"].includes(parsed.messageType)
  ) {
    return null;
  }

  return {
    parsed,
    payload: parsePayload(input.payload)
  };
}

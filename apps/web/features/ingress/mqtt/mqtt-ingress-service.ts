import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  parseMqttUsername,
  parseTopic,
  type MqttUsername
} from "@ziot/domain";

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
  product: {
    id: string;
    product_key: string;
  };
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

function parseClientUsername(username: unknown): MqttUsername | null {
  return typeof username === "string" ? parseMqttUsername(username) : null;
}

export async function authenticateMqttClient(
  db: Db,
  input: {
    username: unknown;
    password: unknown;
  }
): Promise<MqttDecision> {
  const username = parseClientUsername(input.username);
  const password = typeof input.password === "string" ? input.password : "";

  if (!username || !password) {
    return deny("invalid credentials");
  }

  const device = await findActiveDeviceByUsername(db, username);

  if (!device || device.status !== "active") {
    return deny("device not found or disabled");
  }

  const verified = await bcrypt.compare(
    password.toLowerCase(),
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
  const ownServicePrefix = `/sys/${username.productKey}/${username.deviceKey}/thing/service/`;
  const ownOtaPrefix = `/ota/${username.productKey}/${username.deviceKey}/upgrade/`;

  return (
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
    return deny("device not found or disabled");
  }

  if (action === "publish") {
    return topicMatchesOwnDevice(
      topic,
      username,
      new Set([
        "property.post",
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
    return deny("device not found");
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

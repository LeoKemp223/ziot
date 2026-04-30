import { randomUUID } from "node:crypto";
import Redis from "ioredis";

type Db = { [key: string]: any };
type AccessScope = {
  userId?: string;
  canAccessAll?: boolean;
};

type ControlError = Error & {
  code: 400001 | 403001 | 404001 | 409001 | 500001;
};

type CommandKind = "property_set" | "service";

type CreateCommandInput = AccessScope & {
  orgId: string;
  userId: string;
  deviceId: string;
  kind: CommandKind;
  identifier?: string;
  params: unknown;
  timeoutMs?: number;
};

type BatchCommandInput = AccessScope & {
  orgId: string;
  userId: string;
  groupId: string;
  kind: CommandKind;
  identifier?: string;
  params: unknown;
  timeoutMs?: number;
};

type CommandReplyInput = {
  topic: unknown;
  payload: unknown;
};

function controlError(code: ControlError["code"], message: string): ControlError {
  return Object.assign(new Error(message), { code });
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

let redisClient: Redis | null = null;
let cachedEmqxToken: { apiUrl: string; token: string; expiresAt: number } | null = null;

function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  redisClient ??= new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });

  return redisClient;
}

function commandStatusChannel(commandId: string) {
  return `command:status:${commandId}`;
}

function ownerFilter(input: AccessScope) {
  return input.canAccessAll || !input.userId ? {} : { created_by: input.userId };
}

function normalizeTimeout(timeoutMs: number | undefined) {
  if (timeoutMs === undefined) {
    return 15_000;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw controlError(400001, "timeout_ms must be between 1000 and 120000");
  }

  return Math.floor(timeoutMs);
}

function assertJsonObject(value: unknown, name: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw controlError(400001, `${name} must be an object`);
  }
}

function assertIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(identifier)) {
    throw controlError(
      400001,
      "identifier must be 1-128 characters and start with a letter or underscore"
    );
  }
}

function mapCommand(command: any) {
  return {
    id: command.id,
    org_id: command.org_id,
    device_id: command.device_id,
    device_name: command.device?.name ?? "",
    product_key: command.device?.product?.product_key ?? "",
    device_key: command.device?.device_key ?? "",
    identifier: command.identifier,
    params: command.params,
    status: command.status,
    request_id: command.request_id,
    result: command.result,
    error_code: command.error_code,
    error_message: command.error_message,
    timeout_at: command.timeout_at.toISOString(),
    sent_at: command.sent_at?.toISOString() ?? null,
    replied_at: command.replied_at?.toISOString() ?? null,
    created_at: command.created_at.toISOString(),
    updated_at: command.updated_at.toISOString()
  };
}

async function expireTimedOutCommands(db: Db) {
  await db.deviceCommand.updateMany({
    where: {
      status: { in: ["pending", "sent", "delivered"] },
      timeout_at: { lt: new Date() }
    },
    data: {
      status: "timeout",
      error_code: "timeout",
      error_message: "command timed out"
    }
  });
}

export async function expireStaleCommands(db: Db) {
  return expireTimedOutCommands(db);
}

async function findDeviceForControl(
  db: Db,
  input: AccessScope & {
    orgId: string;
    deviceId: string;
  }
) {
  const device = await db.device.findFirst({
    where: {
      id: input.deviceId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: { product: true }
  });

  if (!device) {
    throw controlError(404001, "device not found");
  }

  if (device.status !== "active") {
    throw controlError(403001, "device is disabled");
  }

  return device;
}

function commandTopic(device: any, kind: CommandKind, identifier: string) {
  if (kind === "property_set") {
    return `/sys/${device.product.product_key}/${device.device_key}/thing/property/set`;
  }

  return `/sys/${device.product.product_key}/${device.device_key}/thing/service/${identifier}/invoke`;
}

function commandPayload(requestId: string, params: unknown) {
  return {
    id: requestId,
    request_id: requestId,
    params
  };
}

async function emqxToken() {
  const apiUrl = process.env.EMQX_API_URL ?? "http://localhost:18083";
  const username = process.env.EMQX_DASHBOARD_USERNAME ?? "admin";
  const password = process.env.EMQX_DASHBOARD_PASSWORD ?? "public123";

  if (
    cachedEmqxToken &&
    cachedEmqxToken.apiUrl === apiUrl &&
    cachedEmqxToken.expiresAt > Date.now()
  ) {
    return { apiUrl, token: cachedEmqxToken.token };
  }

  const response = await fetch(`${apiUrl}/api/v5/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw controlError(500001, "failed to login emqx");
  }

  const body = (await response.json()) as { token?: string };

  if (!body.token) {
    throw controlError(500001, "failed to login emqx");
  }

  cachedEmqxToken = {
    apiUrl,
    token: body.token,
    expiresAt: Date.now() + 10 * 60 * 1000
  };

  return { apiUrl, token: body.token };
}

async function publishMqtt(topic: string, payload: unknown) {
  let lastError = "failed to publish mqtt command";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { apiUrl, token } = await emqxToken();
    const response = await fetch(`${apiUrl}/api/v5/publish`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        topic,
        payload: JSON.stringify(payload),
        qos: 1,
        retain: false
      })
    });

    if (response.ok) {
      return;
    }

    lastError = await response.text().catch(() => "failed to publish mqtt command");
    if (response.status === 401 || response.status === 403) {
      cachedEmqxToken = null;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300 * (attempt + 1)));
  }

  throw controlError(500001, lastError || "failed to publish mqtt command");
}

export async function createDeviceCommand(db: Db, input: CreateCommandInput) {
  assertJsonObject(input.params, "params");
  const kind = input.kind;
  const identifier =
    kind === "property_set" ? "property.set" : (input.identifier ?? "").trim();

  if (kind !== "property_set" && kind !== "service") {
    throw controlError(400001, "kind must be property_set or service");
  }

  if (kind === "service") {
    assertIdentifier(identifier);
  }

  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const device = await findDeviceForControl(db, input);
  const commandId = id("cmd");
  const requestId = commandId;
  const timeoutAt = new Date(Date.now() + timeoutMs);

  const command = await db.deviceCommand.create({
    data: {
      id: commandId,
      org_id: input.orgId,
      device_id: input.deviceId,
      identifier,
      params: input.params,
      status: "pending",
      request_id: requestId,
      timeout_at: timeoutAt,
      created_by: input.userId
    },
    include: { device: { include: { product: true } } }
  });

  const topic = commandTopic(device, kind, identifier);
  const payload = commandPayload(requestId, input.params);

  try {
    await publishMqtt(topic, payload);
  } catch (error) {
    await db.deviceCommand.update({
      where: { id: command.id },
      data: {
        status: "failed",
        error_code: "publish_failed",
        error_message:
          error instanceof Error ? error.message : "failed to publish mqtt command"
      }
    });
    throw error;
  }

  await db.deviceCommand.updateMany({
    where: { id: command.id, status: "pending" },
    data: {
      status: "sent",
      sent_at: new Date()
    }
  });
  const sentCommand = await db.deviceCommand.findUniqueOrThrow({
    where: { id: command.id },
    include: { device: { include: { product: true } } }
  });

  if (kind === "property_set") {
    await db.deviceShadow.update({
      where: { device_id: input.deviceId },
      data: {
        desired: input.params,
        version: { increment: 1 }
      }
    });
  }

  return mapCommand(sentCommand);
}

async function publishCommandStatus(commandId: string, status: string) {
  const redis = getRedisClient();

  if (!redis) {
    return;
  }

  await redis
    .publish(commandStatusChannel(commandId), JSON.stringify({ command_id: commandId, status }))
    .catch(() => undefined);
}

export async function waitForCommandTerminal(
  db: Db,
  input: AccessScope & {
    orgId: string;
    commandId: string;
    timeoutMs: number;
  }
) {
  const startedAt = Date.now();
  const terminal = new Set(["success", "failed", "timeout", "cancelled"]);
  const redis = getRedisClient();

  if (redis) {
    const subscriber = redis.duplicate({
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    const channel = commandStatusChannel(input.commandId);

    try {
      await subscriber.subscribe(channel);
      const result = await Promise.race([
        new Promise<void>((resolveWait) => {
          subscriber.on("message", (_channel, message) => {
            try {
              const body = JSON.parse(message) as { status?: string };
              if (body.status && terminal.has(body.status)) {
                resolveWait();
              }
            } catch {
              resolveWait();
            }
          });
        }),
        new Promise<void>((resolveTimeout) =>
          setTimeout(resolveTimeout, Math.min(input.timeoutMs, 120_000))
        )
      ]);
      void result;
    } catch {
      await new Promise((resolveWait) =>
        setTimeout(resolveWait, Math.min(input.timeoutMs, 120_000))
      );
    } finally {
      await subscriber.disconnect();
    }
  } else {
    while (Date.now() - startedAt < input.timeoutMs) {
      const command = await getCommand(db, input);
      if (terminal.has(command.status)) {
        return command;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }

  return getCommand(db, input);
}

export async function createSyncDeviceCommand(db: Db, input: CreateCommandInput) {
  const command = await createDeviceCommand(db, input);

  return waitForCommandTerminal(db, {
    orgId: input.orgId,
    userId: input.userId,
    commandId: command.id,
    timeoutMs: normalizeTimeout(input.timeoutMs),
    ...(input.canAccessAll !== undefined ? { canAccessAll: input.canAccessAll } : {})
  });
}

function servicesFromThingModel(product: any): string[] {
  const thingModel = product?.thing_model;

  if (
    typeof thingModel !== "object" ||
    thingModel === null ||
    !Array.isArray((thingModel as any).services)
  ) {
    return [];
  }

  return (thingModel as any).services
    .map((service: any) => String(service.identifier ?? ""))
    .filter(Boolean);
}

export async function createGroupCommands(db: Db, input: BatchCommandInput) {
  assertJsonObject(input.params, "params");

  if (input.kind === "service") {
    assertIdentifier((input.identifier ?? "").trim());
  }

  const group = await db.deviceGroup.findFirst({
    where: {
      id: input.groupId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: {
      product: true,
      members: {
        include: {
          device: { include: { product: true } }
        }
      }
    }
  });

  if (!group) {
    throw controlError(404001, "device group not found");
  }

  const devices = group.members
    .map((member: any) => member.device)
    .filter((device: any) => device && !device.deleted_at);

  if (devices.length === 0) {
    throw controlError(400001, "device group is empty");
  }

  if (
    devices.some(
      (device: any) => (device.product_id ?? device.product?.id) !== group.product_id
    )
  ) {
    throw controlError(409001, "device group contains multiple products");
  }

  if (input.kind === "service") {
    const services = servicesFromThingModel(group.product);
    const identifier = (input.identifier ?? "").trim();

    if (services.length > 0 && !services.includes(identifier)) {
      throw controlError(400001, "service is not defined on product thing model");
    }
  }

  const commands = [];

  for (const device of devices) {
    commands.push(
      await createDeviceCommand(db, {
        orgId: input.orgId,
        userId: input.userId,
        deviceId: device.id,
        kind: input.kind,
        ...(input.canAccessAll !== undefined
          ? { canAccessAll: input.canAccessAll }
          : {}),
        ...(input.identifier ? { identifier: input.identifier } : {}),
        params: input.params,
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {})
      })
    );
  }

  return {
    group_id: input.groupId,
    total: commands.length,
    commands
  };
}

export async function listDeviceCommands(
  db: Db,
  input: AccessScope & {
    orgId: string;
    deviceId: string;
    page?: number;
    pageSize?: number;
  }
) {
  await expireTimedOutCommands(db);
  await findDeviceForControl(db, input);
  const page = Math.max(1, Math.floor(Number(input.page ?? 1)) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Math.floor(Number(input.pageSize ?? 20)) || 20)
  );
  const where = {
    org_id: input.orgId,
    device_id: input.deviceId
  };
  const total = await db.deviceCommand.count({ where });
  const commands = await db.deviceCommand.findMany({
    where,
    orderBy: { created_at: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { device: { include: { product: true } } }
  });

  return {
    items: commands.map((command: any) => mapCommand(command)),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

export async function getCommand(
  db: Db,
  input: AccessScope & {
    orgId: string;
    commandId: string;
  }
) {
  await expireTimedOutCommands(db);
  const command = await db.deviceCommand.findFirst({
    where: {
      id: input.commandId,
      org_id: input.orgId,
      device: ownerFilter(input)
    },
    include: { device: { include: { product: true } } }
  });

  if (!command) {
    throw controlError(404001, "command not found");
  }

  return mapCommand(command);
}

function parseReplyPayload(payload: unknown) {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Record<
        string,
        unknown
      >;
    }
  }

  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  throw controlError(400001, "payload must be an object");
}

export async function recordCommandReply(db: Db, input: CommandReplyInput) {
  const payload = parseReplyPayload(input.payload);
  const requestId = String(payload.request_id ?? payload.id ?? "");

  if (!requestId) {
    throw controlError(400001, "request_id is required");
  }

  const code = Number(payload.code ?? 0);
  const success = code === 0;
  const command = await db.deviceCommand.findUnique({
    where: { request_id: requestId }
  });

  if (!command) {
    throw controlError(404001, "command not found");
  }

  if (["success", "failed", "timeout", "cancelled"].includes(command.status)) {
    return mapCommand(
      await db.deviceCommand.findUniqueOrThrow({
        where: { request_id: requestId },
        include: { device: { include: { product: true } } }
      })
    );
  }

  const updated = await db.deviceCommand.update({
    where: { request_id: requestId },
    data: {
      status: success ? "success" : "failed",
      result: payload.data ?? payload,
      error_code: success ? null : String(payload.code ?? "device_error"),
      error_message: success ? null : String(payload.message ?? "device command failed"),
      replied_at: new Date()
    },
    include: { device: { include: { product: true } } }
  });

  await publishCommandStatus(updated.id, updated.status);

  return mapCommand(updated);
}

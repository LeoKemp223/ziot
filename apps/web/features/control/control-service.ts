import { randomUUID } from "node:crypto";

type Db = { [key: string]: any };
type AccessScope = {
  userId?: string;
  canAccessAll?: boolean;
};

type ControlError = Error & {
  code: 400001 | 403001 | 404001 | 500001;
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

  return { apiUrl, token: body.token };
}

async function publishMqtt(topic: string, payload: unknown) {
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

  if (!response.ok) {
    throw controlError(500001, "failed to publish mqtt command");
  }
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

  const sentCommand = await db.deviceCommand.update({
    where: { id: command.id },
    data: {
      status: "sent",
      sent_at: new Date()
    },
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

export async function listDeviceCommands(
  db: Db,
  input: AccessScope & {
    orgId: string;
    deviceId: string;
  }
) {
  await expireTimedOutCommands(db);
  await findDeviceForControl(db, input);
  const commands = await db.deviceCommand.findMany({
    where: {
      org_id: input.orgId,
      device_id: input.deviceId
    },
    orderBy: { created_at: "desc" },
    take: 20,
    include: { device: { include: { product: true } } }
  });

  return commands.map((command: any) => mapCommand(command));
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

  return mapCommand(updated);
}

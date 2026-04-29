import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import Redis from "ioredis";
import {
  createHttpCanonicalString,
  mergeReportedShadow,
  sha256Hex,
  verifyHmacSha256
} from "@ziot/domain";

type Db = { [key: string]: any };

type HttpDeviceError = Error & {
  code: 400001 | 401001 | 403001 | 404001 | 409001 | 500001;
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

export type HttpDeviceContext = {
  device: DeviceRecord;
  timestamp: string;
  nonce: string;
};

export type NonceStore = {
  reserve(key: string, ttlSeconds: number): Promise<boolean>;
};

const timestampWindowMs = 5 * 60 * 1000;
let redisClient: Redis | null = null;
const memoryNonces = new Map<string, number>();

function httpDeviceError(
  code: HttpDeviceError["code"],
  message: string
): HttpDeviceError {
  return Object.assign(new Error(message), { code });
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function header(headers: Headers, name: string): string {
  return headers.get(name)?.trim() ?? "";
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  throw httpDeviceError(400001, "payload must be an object");
}

function reportParams(payload: Record<string, unknown>) {
  return typeof payload.params === "object" &&
    payload.params !== null &&
    !Array.isArray(payload.params)
    ? (payload.params as Record<string, unknown>)
    : payload;
}

function logLevel(payload: Record<string, unknown>) {
  return ["debug", "info", "warn", "error"].includes(String(payload.level))
    ? String(payload.level)
    : "info";
}

function mapCommand(command: any) {
  return {
    id: command.id,
    request_id: command.request_id,
    identifier: command.identifier,
    kind: command.identifier === "property.set" ? "property_set" : "service",
    params: command.params,
    status: command.status,
    timeout_at: command.timeout_at.toISOString(),
    created_at: command.created_at.toISOString()
  };
}

function getRedisClient() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  redisClient ??= new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });

  return redisClient;
}

export function createMemoryNonceStore(): NonceStore {
  return {
    async reserve(key: string, ttlSeconds: number) {
      const now = Date.now();
      for (const [nonceKey, expiresAt] of memoryNonces.entries()) {
        if (expiresAt <= now) {
          memoryNonces.delete(nonceKey);
        }
      }

      if (memoryNonces.has(key)) {
        return false;
      }

      memoryNonces.set(key, now + ttlSeconds * 1000);
      return true;
    }
  };
}

export function createRedisNonceStore(): NonceStore {
  return {
    async reserve(key: string, ttlSeconds: number) {
      const redis = getRedisClient();

      if (!redis) {
        return createMemoryNonceStore().reserve(key, ttlSeconds);
      }

      const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    }
  };
}

export async function authenticateHttpDevice(
  db: Db,
  input: {
    method: string;
    path: string;
    headers: Headers;
    body: string;
    now?: Date;
    nonceStore?: NonceStore;
  }
): Promise<HttpDeviceContext> {
  const productKey = header(input.headers, "x-ziot-product-key");
  const deviceKey = header(input.headers, "x-ziot-device-key");
  const deviceSecret = header(input.headers, "x-ziot-device-secret");
  const timestamp = header(input.headers, "x-ziot-timestamp");
  const nonce = header(input.headers, "x-ziot-nonce");
  const signature = header(input.headers, "x-ziot-signature");
  const providedBodyHash = header(input.headers, "x-ziot-body-sha256");

  if (!productKey || !deviceKey || !timestamp || !nonce || !signature) {
    throw httpDeviceError(401001, "missing device signature headers");
  }

  const timestampMs = Number(timestamp);
  const nowMs = (input.now ?? new Date()).getTime();

  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > timestampWindowMs) {
    throw httpDeviceError(401001, "expired timestamp");
  }

  const bodySha256 = sha256Hex(input.body);

  if (providedBodyHash && providedBodyHash !== bodySha256) {
    throw httpDeviceError(401001, "body hash mismatch");
  }

  const device = await db.device.findFirst({
    where: {
      device_key: deviceKey,
      deleted_at: null,
      product: {
        product_key: productKey,
        deleted_at: null
      }
    },
    include: { product: true }
  });

  if (!device) {
    throw httpDeviceError(401001, "invalid device credentials");
  }

  if (device.status !== "active") {
    throw httpDeviceError(403001, "device is disabled");
  }

  if (!deviceSecret || !(await bcrypt.compare(deviceSecret, device.device_secret_hash))) {
    throw httpDeviceError(401001, "invalid device credentials");
  }

  const canonical = createHttpCanonicalString({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    bodySha256
  });

  if (!verifyHmacSha256(deviceSecret, canonical, signature)) {
    throw httpDeviceError(401001, "invalid signature");
  }

  const nonceKey = `http-device:${productKey}:${deviceKey}:${timestamp}:${nonce}`;
  const reserved = await (input.nonceStore ?? createRedisNonceStore()).reserve(
    nonceKey,
    Math.ceil(timestampWindowMs / 1000)
  );

  if (!reserved) {
    throw httpDeviceError(409001, "replayed nonce");
  }

  return {
    device,
    timestamp,
    nonce
  };
}

export async function recordHttpDeviceReport(
  db: Db,
  input: {
    context: HttpDeviceContext;
    type: "property" | "event" | "log";
    payload: unknown;
  }
) {
  const payload = parsePayload(input.payload);
  const now = new Date();
  const device = input.context.device;

  if (input.type === "property") {
    const params = reportParams(payload);
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

      await db.deviceShadow.update({
        where: { device_id: device.id },
        data: {
          reported: merged.reported,
          version: { increment: 1 }
        }
      });
    }
  }

  await db.device.update({
    where: { id: device.id },
    data: {
      online_status: "online",
      last_heartbeat_at: now
    }
  });

  await db.deviceLog.create({
    data: {
      id: id("dlg"),
      org_id: device.org_id,
      product_id: device.product_id,
      device_id: device.id,
      type: input.type,
      level: input.type === "log" ? logLevel(payload) : "info",
      content: {
        protocol: "http",
        payload
      },
      occurred_at: now
    }
  });

  return { accepted: true };
}

export async function listPendingHttpDeviceCommands(
  db: Db,
  input: {
    context: HttpDeviceContext;
  }
) {
  const now = new Date();
  const device = input.context.device;

  await db.deviceCommand.updateMany({
    where: {
      status: { in: ["pending", "sent", "delivered"] },
      timeout_at: { lt: now }
    },
    data: {
      status: "timeout",
      error_code: "timeout",
      error_message: "command timed out"
    }
  });

  const commands = await db.deviceCommand.findMany({
    where: {
      org_id: device.org_id,
      device_id: device.id,
      status: { in: ["pending", "sent", "delivered"] },
      timeout_at: { gte: now }
    },
    orderBy: { created_at: "asc" },
    take: 10
  });

  const deliverableIds = commands
    .filter((command: any) => command.status !== "delivered")
    .map((command: any) => command.id);

  if (deliverableIds.length > 0) {
    await db.deviceCommand.updateMany({
      where: {
        id: { in: deliverableIds },
        status: { in: ["pending", "sent"] }
      },
      data: {
        status: "delivered",
        sent_at: now
      }
    });
  }

  await db.device.update({
    where: { id: device.id },
    data: {
      online_status: "online",
      last_heartbeat_at: now
    }
  });

  return commands.map((command: any) =>
    mapCommand({
      ...command,
      status: "delivered"
    })
  );
}

export async function recordHttpDeviceCommandReply(
  db: Db,
  input: {
    context: HttpDeviceContext;
    requestId: string;
    payload: unknown;
  }
) {
  const payload = parsePayload(input.payload);
  const device = input.context.device;
  const command = await db.deviceCommand.findFirst({
    where: {
      request_id: input.requestId,
      org_id: device.org_id,
      device_id: device.id
    }
  });

  if (!command) {
    throw httpDeviceError(404001, "command not found");
  }

  if (["success", "failed", "timeout", "cancelled"].includes(command.status)) {
    return mapCommand(command);
  }

  const code = Number(payload.code ?? 0);
  const success = code === 0;
  const updated = await db.deviceCommand.update({
    where: { request_id: input.requestId },
    data: {
      status: success ? "success" : "failed",
      result: payload.data ?? payload,
      error_code: success ? null : String(payload.code ?? "device_error"),
      error_message: success ? null : String(payload.message ?? "device command failed"),
      replied_at: new Date()
    }
  });

  return mapCommand(updated);
}

import { randomUUID } from "node:crypto";
import { mergeReportedShadow, parseTopic } from "@ziot/domain";

type Db = { [key: string]: any };

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
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

function reportParams(payload: Record<string, unknown>) {
  return typeof payload.params === "object" &&
    payload.params !== null &&
    !Array.isArray(payload.params)
    ? (payload.params as Record<string, unknown>)
    : payload;
}

export async function processTelemetryReport(
  db: Db,
  input: { topic: string; payload: unknown; received_at?: string }
) {
  const parsed = parseTopic(input.topic);

  if (
    !parsed ||
    !["property.post", "event.post", "log.post"].includes(parsed.messageType)
  ) {
    return { result: "deny", reason: "invalid report topic" };
  }

  const device = await db.device.findFirst({
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

  if (!device) {
    return { result: "deny", reason: "device not found" };
  }

  const payload = parsePayload(input.payload);
  const now = input.received_at ? new Date(input.received_at) : new Date();
  const type = reportType(parsed.messageType);

  if (parsed.messageType === "property.post") {
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
        reportParams(payload)
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
        topic: input.topic,
        payload
      },
      occurred_at: now
    }
  });

  return { result: "allow" };
}

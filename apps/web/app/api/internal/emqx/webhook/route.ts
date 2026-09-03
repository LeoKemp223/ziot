import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import {
  parseMqttOtaProgressInput,
  recordMqttReport,
  recordMqttWebhookEvent
} from "@/features/ingress/mqtt/mqtt-ingress-service";
import {
  enqueueTelemetryReport
} from "@/features/ingress/telemetry/telemetry-queue";
import { recordCommandReply } from "@/features/control/control-service";
import { recordOtaProgress } from "@/features/ota/ota-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const topic = typeof body.topic === "string" ? body.topic : "";
    // 服务调用应答与属性设置应答走同一套命令闭环
    if (
      topic.includes("/thing/service/") ||
      topic.includes("/thing/property/set_reply")
    ) {
      await recordCommandReply(prisma, {
        topic,
        payload: body.payload
      });

      return NextResponse.json({ result: "allow" });
    }

    if (topic.includes("/thing/")) {
      const queued = await enqueueTelemetryReport({
        topic,
        payload: body.payload
      }).catch(() => false);
      const decision = queued
        ? { result: "allow" }
        : await recordMqttReport(prisma, {
            topic,
            payload: body.payload
          });

      return NextResponse.json(decision);
    }

    if (topic.startsWith("/ota/")) {
      const parsed = await parseMqttOtaProgressInput({
        topic,
        payload: body.payload
      });

      if (!parsed) {
        return NextResponse.json({ result: "deny", reason: "invalid ota topic" });
      }

      await recordOtaProgress(prisma, {
        productKey: parsed.parsed.productKey,
        deviceKey: parsed.parsed.deviceKey,
        taskId: String(parsed.payload.task_id ?? parsed.payload.taskId ?? ""),
        status:
          parsed.parsed.messageType === "upgrade.result"
            ? Number(parsed.payload.code ?? 0) === 0
              ? "success"
              : "failed"
            : (["notified", "downloading", "installing", "success", "failed"].includes(
                  String(parsed.payload.status)
                )
                ? (String(parsed.payload.status) as any)
                : "downloading"),
        progress: parsed.payload.progress,
        ...(typeof parsed.payload.error_message === "string"
          ? { errorMessage: parsed.payload.error_message }
          : {}),
        ...(typeof parsed.payload.firmware_version === "string"
          ? { firmwareVersion: parsed.payload.firmware_version }
          : {})
      });

      return NextResponse.json({ result: "allow" });
    }

    const connectedAt =
      typeof body.timestamp === "number" ? new Date(body.timestamp) : undefined;
    const decision = await recordMqttWebhookEvent(prisma, {
      event: body.event,
      username: body.username,
      clientId: body.clientid ?? body.client_id,
      ...(connectedAt ? { connectedAt } : {})
    });

    return NextResponse.json(decision);
  } catch {
    return NextResponse.json({ result: "deny", reason: "请求失败" });
  }
}

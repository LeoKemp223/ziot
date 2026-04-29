import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { recordMqttWebhookEvent } from "@/features/ingress/mqtt/mqtt-ingress-service";
import { recordCommandReply } from "@/features/control/control-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.topic === "string" && body.topic.includes("/thing/service/")) {
      await recordCommandReply(prisma, {
        topic: body.topic,
        payload: body.payload
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
    return NextResponse.json({ result: "deny", reason: "request failed" });
  }
}

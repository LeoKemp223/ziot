import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { recordMqttWebhookEvent } from "@/features/ingress/mqtt/mqtt-ingress-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
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

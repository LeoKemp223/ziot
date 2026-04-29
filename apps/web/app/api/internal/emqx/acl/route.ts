import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { authorizeMqttAction } from "@/features/ingress/mqtt/mqtt-ingress-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const decision = await authorizeMqttAction(prisma, {
      username: body.username,
      action: body.action,
      topic: body.topic
    });

    return NextResponse.json(decision);
  } catch {
    return NextResponse.json({ result: "deny", reason: "request failed" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { authenticateMqttClient } from "@/features/ingress/mqtt/mqtt-ingress-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const decision = await authenticateMqttClient(prisma, {
      username: body.username,
      password: body.password
    });

    return NextResponse.json(decision);
  } catch {
    return NextResponse.json({ result: "deny", reason: "request failed" });
  }
}

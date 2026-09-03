import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { withAppUser } from "@/lib/identity/app-session";
import { listAppDevices } from "@/features/devices/binding-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withAppUser(request, async (user) =>
    NextResponse.json(
      apiOk(await listAppDevices(prisma, { appUserId: user.id }), createRequestId())
    )
  );
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  mapAppAuthSession,
  refreshAppSession
} from "@/lib/identity/app-auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const session = await refreshAppSession(
      prisma,
      String(body.refresh_token ?? "")
    );

    return NextResponse.json(apiOk(mapAppAuthSession(session), requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

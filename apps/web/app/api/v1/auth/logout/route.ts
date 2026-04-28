import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { logoutUser } from "@/lib/identity/auth-service";
import {
  clearSessionCookies,
  REFRESH_TOKEN_COOKIE
} from "@/lib/identity/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    await logoutUser(prisma, request.cookies.get(REFRESH_TOKEN_COOKIE)?.value);
    const response = NextResponse.json(apiOk({ ok: true }, requestId));
    clearSessionCookies(response);

    return response;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

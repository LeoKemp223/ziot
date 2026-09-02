import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { refreshSession } from "@/lib/identity/auth-service";
import {
  CURRENT_ORG_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies
} from "@/lib/identity/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) {
      throw Object.assign(new Error("无效的刷新令牌"), { code: 401001 });
    }

    const session = await refreshSession(
      prisma,
      refreshToken,
      request.cookies.get(CURRENT_ORG_COOKIE)?.value
    );
    const response = NextResponse.json(apiOk(session.user, requestId));
    setSessionCookies(response, session);

    return response;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

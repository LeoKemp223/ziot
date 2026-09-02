import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { createRequestId } from "@/lib/request-id";
import {
  loadSessionUser,
  verifyAccessToken,
  type AuthSession,
  type SessionUser
} from "./auth-service";

export const ACCESS_TOKEN_COOKIE = "ziot_access_token";
export const REFRESH_TOKEN_COOKIE = "ziot_refresh_token";
export const CURRENT_ORG_COOKIE = "ziot_current_org_id";

export function setSessionCookies(response: NextResponse, session: AuthSession) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: session.accessTokenExpiresAt
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: session.refreshTokenExpiresAt
  });
  response.cookies.set(CURRENT_ORG_COOKIE, session.user.current_org_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: session.refreshTokenExpiresAt
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  response.cookies.delete(CURRENT_ORG_COOKIE);
}

export async function getCurrentUser(
  request: NextRequest
): Promise<SessionUser> {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) {
    throw Object.assign(new Error("请先登录"), { code: 401001 });
  }

  const currentOrgId = request.cookies.get(CURRENT_ORG_COOKIE)?.value;
  const session = await verifyAccessToken(token);

  return loadSessionUser(prisma, session.userId, currentOrgId ?? session.currentOrgId);
}

export async function withCurrentUser<T>(
  request: NextRequest,
  handler: (user: SessionUser) => Promise<NextResponse<T>>
): Promise<NextResponse<T> | NextResponse> {
  const requestId = createRequestId();

  try {
    return await handler(await getCurrentUser(request));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

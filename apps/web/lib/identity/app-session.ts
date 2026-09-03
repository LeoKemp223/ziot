import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { createRequestId } from "@/lib/request-id";
import {
  loadAppUser,
  verifyAppAccessToken,
  type AppSessionUser
} from "./app-auth-service";

export async function getAppUser(
  request: NextRequest
): Promise<AppSessionUser> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : undefined;

  if (!token) {
    throw Object.assign(new Error("缺少访问令牌"), { code: 401001 });
  }

  const session = await verifyAppAccessToken(token);

  return loadAppUser(prisma, session.appUserId);
}

export async function withAppUser<T>(
  request: NextRequest,
  handler: (user: AppSessionUser) => Promise<NextResponse<T>>
): Promise<NextResponse<T> | NextResponse> {
  const requestId = createRequestId();

  try {
    return await handler(await getAppUser(request));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { loginUser } from "@/lib/identity/auth-service";
import { setSessionCookies } from "@/lib/identity/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const currentOrgId = request.cookies.get("ziot_current_org_id")?.value;
    const session = await loginUser(prisma, {
      account: String(body.account ?? ""),
      password: String(body.password ?? ""),
      ...(currentOrgId ? { currentOrgId } : {})
    });
    const response = NextResponse.json(apiOk(session.user, requestId));
    setSessionCookies(response, session);

    return response;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

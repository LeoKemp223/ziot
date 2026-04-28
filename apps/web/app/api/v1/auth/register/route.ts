import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { registerWithInvitation } from "@/lib/identity/auth-service";
import { setSessionCookies } from "@/lib/identity/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const session = await registerWithInvitation(prisma, {
      account: String(body.account ?? ""),
      password: String(body.password ?? ""),
      display_name: String(body.display_name ?? ""),
      invitation_code: String(body.invitation_code ?? "")
    });
    const response = NextResponse.json(apiOk(session.user, requestId), {
      status: 201
    });
    setSessionCookies(response, session);

    return response;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

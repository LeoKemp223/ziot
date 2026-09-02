import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { resetPasswordWithInvitation } from "@/lib/identity/auth-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const reset = await resetPasswordWithInvitation(prisma, {
      account: String(body.account ?? ""),
      password: String(body.password ?? ""),
      invitation_code: String(body.invitation_code ?? "")
    });
    const response = NextResponse.json(apiOk(reset, requestId));
    await safeWriteAuditLog(prisma, {
      user: { id: reset.user_id, current_org_id: reset.org_id },
      action: "auth.reset_password",
      resourceType: "user",
      resourceId: reset.user_id,
      request,
      detail: { account: reset.account }
    });

    return response;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

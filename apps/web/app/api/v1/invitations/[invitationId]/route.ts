import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  disableInvitation,
  getInvitation
} from "@/lib/identity/auth-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

type InvitationRouteContext = {
  params: Promise<{
    invitationId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: InvitationRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("invite:read")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { invitationId } = await params;
    return NextResponse.json(
      apiOk(
        await getInvitation(prisma, user.current_org_id, invitationId),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: InvitationRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("invite:write")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (body.status !== "disabled") {
      throw Object.assign(new Error("status 参数只支持 disabled"), {
        code: 400001
      });
    }

    const { invitationId } = await params;
    const invitation = await disableInvitation(
      prisma,
      user.current_org_id,
      invitationId
    );
    await safeWriteAuditLog(prisma, {
      user,
      action: "invitation.disable",
      resourceType: "invitation",
      resourceId: invitation.id,
      request,
      detail: { status: invitation.status }
    });

    return NextResponse.json(apiOk(invitation, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

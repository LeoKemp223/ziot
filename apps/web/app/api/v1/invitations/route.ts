import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  createInvitations,
  listInvitations
} from "@/lib/identity/auth-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function requireInvitationPermission(permissions: string[]) {
  if (!permissions.includes("invite:read") && !permissions.includes("invite:write")) {
    throw Object.assign(new Error("没有操作权限"), { code: 403001 });
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requireInvitationPermission(user.permissions);

    return NextResponse.json(
      apiOk(await listInvitations(prisma, user.current_org_id), requestId)
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("invite:write")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const invitations = await createInvitations(prisma, {
      orgId: user.current_org_id,
      roleId: String(body.role_id ?? ""),
      createdBy: user.id,
      count: Number(body.count ?? "1"),
      maxUses: Number(body.max_uses ?? "1"),
      ...(body.expires_at ? { expiresAt: new Date(String(body.expires_at)) } : {})
    });
    for (const invitation of invitations) {
      await safeWriteAuditLog(prisma, {
        user,
        action: "invitation.create",
        resourceType: "invitation",
        resourceId: invitation.id,
        request,
        detail: {
          role_id: invitation.role_id,
          max_uses: invitation.max_uses,
          expires_at: invitation.expires_at
        }
      });
    }

    return NextResponse.json(apiOk(invitations, requestId), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

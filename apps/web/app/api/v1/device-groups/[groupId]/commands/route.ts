import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createGroupCommands } from "@/features/control/control-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";
import { createRequestId } from "@/lib/request-id";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:control")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { groupId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createGroupCommands(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      groupId,
      kind:
        body.kind === "property_set" || body.kind === "service"
          ? body.kind
          : "service",
      ...(typeof body.identifier === "string"
        ? { identifier: body.identifier }
        : {}),
      params: body.params,
      ...(typeof body.timeout_ms === "number"
        ? { timeoutMs: body.timeout_ms }
        : {})
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "device.control.batch",
      resourceType: "device_group",
      resourceId: groupId,
      request,
      detail: {
        total: result.total,
        identifiers: result.commands.map((command: any) => command.identifier)
      }
    });

    return NextResponse.json(apiOk(result, requestId), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { getFirmware, updateFirmwareStatus } from "@/features/ota/ota-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

type FirmwareRouteContext = {
  params: Promise<{ firmwareId: string }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("没有操作权限"), { code: 403001 });
  }
}

export async function GET(request: NextRequest, { params }: FirmwareRouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:read");
    const { firmwareId } = await params;

    return NextResponse.json(
      apiOk(
        await getFirmware(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          firmwareId
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: FirmwareRouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:write");
    const { firmwareId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    if (body.status !== "released" && body.status !== "deprecated") {
      throw Object.assign(new Error("固件状态只能是 released 或 deprecated"), {
        code: 400001
      });
    }

    const firmware = await updateFirmwareStatus(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      firmwareId,
      status: body.status
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "firmware.status.update",
      resourceType: "firmware",
      resourceId: firmware.id,
      request,
      detail: { status: firmware.status, version: firmware.version }
    });

    return NextResponse.json(apiOk(firmware, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

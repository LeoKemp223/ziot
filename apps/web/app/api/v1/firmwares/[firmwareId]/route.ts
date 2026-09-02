import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { getFirmware, deleteFirmware } from "@/features/ota/ota-service";
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

export async function DELETE(
  request: NextRequest,
  { params }: FirmwareRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:write");
    const { firmwareId } = await params;
    const firmware = await getFirmware(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      firmwareId
    });
    await deleteFirmware(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      firmwareId
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "firmware.delete",
      resourceType: "firmware",
      resourceId: firmwareId,
      request,
      detail: {
        product_id: firmware.product_id,
        version: firmware.version,
        file_url: firmware.file_url
      }
    });

    return NextResponse.json(apiOk({ id: firmwareId, deleted: true }, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

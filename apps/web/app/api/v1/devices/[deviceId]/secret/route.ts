import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { resetDeviceSecret } from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

type DeviceSecretRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  { params }: DeviceSecretRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:write")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { deviceId } = await params;
    const device = await resetDeviceSecret(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      deviceId
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "device.secret.reset",
      resourceType: "device",
      resourceId: device.id,
      request,
      detail: { device_key: device.device_key }
    });

    return NextResponse.json(
      apiOk(device, requestId)
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

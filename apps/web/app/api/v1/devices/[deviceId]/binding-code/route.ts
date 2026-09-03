import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";
import {
  getDeviceBindingCode,
  rotateDeviceBindingCode
} from "@/features/devices/binding-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

// 永久绑定码属于设备凭证,查看与轮换都要求 device:write
function requireWritePermission(permissions: string[]) {
  if (!permissions.includes("device:write")) {
    throw Object.assign(new Error("没有操作权限"), { code: 403001 });
  }
}

function scopeOf(user: {
  id: string;
  current_org_id: string;
  permissions: string[];
}) {
  return {
    orgId: user.current_org_id,
    userId: user.id,
    canAccessAll: user.permissions.includes("user:read")
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requireWritePermission(user.permissions);
    const { deviceId } = await params;

    return NextResponse.json(
      apiOk(
        await getDeviceBindingCode(prisma, { ...scopeOf(user), deviceId }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requireWritePermission(user.permissions);
    const { deviceId } = await params;
    const result = await rotateDeviceBindingCode(prisma, {
      ...scopeOf(user),
      deviceId
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "device.binding_code.rotate",
      resourceType: "device",
      resourceId: deviceId,
      request,
      detail: { generated_at: result.generated_at }
    });

    return NextResponse.json(apiOk(result, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  deleteDevice,
  getDevice,
  updateDevice
} from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

type DeviceRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("没有操作权限"), { code: 403001 });
  }
}

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(request: NextRequest, { params }: DeviceRouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "device:read");
    const { deviceId } = await params;

    return NextResponse.json(
      apiOk(
        await getDevice(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          deviceId
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: DeviceRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "device:write");
    const { deviceId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const device = await updateDevice(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      deviceId,
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(body.status === "active" || body.status === "disabled"
        ? { status: body.status }
        : {}),
      ...(typeof body.firmware_version === "string" || body.firmware_version === null
        ? { firmwareVersion: body.firmware_version }
        : {}),
      ...(Object.hasOwn(body, "tags") ? { tags: body.tags } : {})
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "device.update",
      resourceType: "device",
      resourceId: device.id,
      request,
      detail: {
        name: device.name,
        status: device.status,
        firmware_version: device.firmware_version
      }
    });

    return NextResponse.json(apiOk(device, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: DeviceRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "device:write");
    const { deviceId } = await params;

    const device = await deleteDevice(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      deviceId
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "device.delete",
      resourceType: "device",
      resourceId: device.id,
      request,
      detail: { deleted_at: device.deleted_at }
    });

    return NextResponse.json(apiOk(device, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

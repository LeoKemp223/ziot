import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { withAppUser } from "@/lib/identity/app-session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";
import {
  renameAppDeviceAlias,
  unbindAppDevice
} from "@/features/devices/binding-service";

export const runtime = "nodejs";

type DeviceRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  { params }: DeviceRouteContext
) {
  return withAppUser(request, async (user) => {
    const requestId = createRequestId();

    try {
      const { deviceId } = await params;
      const body = (await request.json()) as Record<string, unknown>;
      const binding = await renameAppDeviceAlias(prisma, {
        appUserId: user.id,
        deviceId,
        ...(Object.hasOwn(body, "alias") ? { alias: String(body.alias ?? "") } : {})
      });

      return NextResponse.json(apiOk(binding, requestId));
    } catch (error) {
      return apiErrorResponse(error, requestId);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: DeviceRouteContext
) {
  return withAppUser(request, async (user) => {
    const requestId = createRequestId();

    try {
      const { deviceId } = await params;
      const result = await unbindAppDevice(prisma, {
        appUserId: user.id,
        deviceId
      });
      await safeWriteAuditLog(prisma, {
        appUser: { id: user.id, org_id: result.org_id, phone: user.phone },
        action: "app.device.unbind",
        resourceType: "device",
        resourceId: deviceId,
        request,
        detail: { phone: user.phone }
      });

      return NextResponse.json(apiOk(result, requestId));
    } catch (error) {
      return apiErrorResponse(error, requestId);
    }
  });
}

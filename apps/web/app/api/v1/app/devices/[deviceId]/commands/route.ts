import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { withAppUser } from "@/lib/identity/app-session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";
import { getActiveBinding } from "@/features/devices/binding-service";
import { createDeviceCommand } from "@/features/control/control-service";

export const runtime = "nodejs";

type DeviceCommandsRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  { params }: DeviceCommandsRouteContext
) {
  return withAppUser(request, async (user) => {
    const requestId = createRequestId();

    try {
      const { deviceId } = await params;
      const { device } = await getActiveBinding(prisma, {
        appUserId: user.id,
        deviceId
      });
      const body = (await request.json()) as Record<string, unknown>;
      const command = await createDeviceCommand(prisma, {
        orgId: device.org_id,
        appUserId: user.id,
        deviceId,
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
        appUser: { id: user.id, org_id: device.org_id, phone: user.phone },
        action: "app.device.control",
        resourceType: "device",
        resourceId: deviceId,
        request,
        detail: {
          command_id: command.id,
          request_id: command.request_id,
          identifier: command.identifier
        }
      });

      return NextResponse.json(apiOk(command, requestId), { status: 201 });
    } catch (error) {
      return apiErrorResponse(error, requestId);
    }
  });
}

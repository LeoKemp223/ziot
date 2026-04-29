import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  createDeviceCommand,
  listDeviceCommands
} from "@/features/control/control-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

type DeviceCommandsRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("permission denied"), { code: 403001 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: DeviceCommandsRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "device:read");
    const { deviceId } = await params;

    return NextResponse.json(
      apiOk(
        await listDeviceCommands(prisma, {
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

export async function POST(
  request: NextRequest,
  { params }: DeviceCommandsRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "device:control");
    const { deviceId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const command = await createDeviceCommand(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
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
      user,
      action: "device.control",
      resourceType: "device",
      resourceId: deviceId,
      request,
      detail: {
        command_id: command.id,
        request_id: command.request_id,
        identifier: command.identifier
      }
    });

    return NextResponse.json(
      apiOk(command, requestId),
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

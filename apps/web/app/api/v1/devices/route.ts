import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { createDevice, listDevices } from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function requireDevicePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("permission denied"), { code: 403001 });
  }
}

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requireDevicePermission(user.permissions, "device:read");

    return NextResponse.json(
      apiOk(
        await listDevices(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          ...(request.nextUrl.searchParams.has("product_id")
            ? { productId: request.nextUrl.searchParams.get("product_id") ?? "" }
            : {})
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requireDevicePermission(user.permissions, "device:write");
    const body = (await request.json()) as Record<string, unknown>;
    const device = await createDevice(prisma, {
      orgId: user.current_org_id,
      createdBy: user.id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId: String(body.product_id ?? ""),
      name: String(body.name ?? ""),
      ...(typeof body.device_key === "string"
        ? { deviceKey: body.device_key }
        : {}),
      ...(typeof body.firmware_version === "string"
        ? { firmwareVersion: body.firmware_version }
        : {}),
      ...(Object.hasOwn(body, "tags") ? { tags: body.tags } : {})
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "device.create",
      resourceType: "device",
      resourceId: device.id,
      request,
      detail: {
        product_id: device.product_id,
        device_key: device.device_key,
        name: device.name
      }
    });

    return NextResponse.json(apiOk(device, requestId), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

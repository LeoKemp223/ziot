import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  getDeviceShadow,
  updateDeviceDesiredShadow
} from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

type DeviceShadowRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: DeviceShadowRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:read")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { deviceId } = await params;
    return NextResponse.json(
      apiOk(
        await getDeviceShadow(prisma, {
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
  { params }: DeviceShadowRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:write")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { deviceId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    return NextResponse.json(
      apiOk(
        await updateDeviceDesiredShadow(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          deviceId,
          desired: body.desired
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

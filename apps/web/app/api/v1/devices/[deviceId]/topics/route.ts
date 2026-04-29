import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { listDeviceTopics } from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

type DeviceTopicsRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(
  request: NextRequest,
  { params }: DeviceTopicsRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:read")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { deviceId } = await params;

    return NextResponse.json(
      apiOk(
        await listDeviceTopics(prisma, {
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { listDeviceReports } from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";

export const runtime = "nodejs";

type DeviceReportsRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(
  request: NextRequest,
  { params }: DeviceReportsRouteContext
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
        await listDeviceReports(prisma, {
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

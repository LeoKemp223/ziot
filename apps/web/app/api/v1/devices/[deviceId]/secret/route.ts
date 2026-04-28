import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { resetDeviceSecret } from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

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
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { deviceId } = await params;
    return NextResponse.json(
      apiOk(
        await resetDeviceSecret(prisma, {
          orgId: user.current_org_id,
          deviceId
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

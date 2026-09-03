import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { withAppUser } from "@/lib/identity/app-session";
import { getActiveBinding } from "@/features/devices/binding-service";

export const runtime = "nodejs";

type DeviceShadowRouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: DeviceShadowRouteContext
) {
  return withAppUser(request, async (user) => {
    const requestId = createRequestId();

    try {
      const { deviceId } = await params;
      const { device } = await getActiveBinding(prisma, {
        appUserId: user.id,
        deviceId
      });
      const shadow = device.shadow;

      return NextResponse.json(
        apiOk(
          {
            device_id: deviceId,
            reported: shadow?.reported ?? {},
            desired: shadow?.desired ?? {},
            version: shadow ? Number(shadow.version) : 0,
            updated_at: shadow?.updated_at?.toISOString() ?? null
          },
          requestId
        )
      );
    } catch (error) {
      return apiErrorResponse(error, requestId);
    }
  });
}

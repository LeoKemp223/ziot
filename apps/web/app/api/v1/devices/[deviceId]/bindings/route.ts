import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { getCurrentUser } from "@/lib/identity/session";
import { listDeviceBindings } from "@/features/devices/binding-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:read")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { deviceId } = await params;
    const url = new URL(request.url);

    return NextResponse.json(
      apiOk(
        await listDeviceBindings(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: user.permissions.includes("user:read"),
          deviceId,
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("page_size") ?? 20)
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

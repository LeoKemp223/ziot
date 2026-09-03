import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { allowRequest } from "@/lib/rate-limit";
import { withAppUser } from "@/lib/identity/app-session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";
import { bindDeviceByCode } from "@/features/devices/binding-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withAppUser(request, async (user) => {
    const requestId = createRequestId();

    try {
      const allowed = await allowRequest(`app-bind:${user.id}`, 20, 60);

      if (!allowed) {
        throw Object.assign(new Error("请求过于频繁，请稍后再试"), {
          code: 429001
        });
      }

      const body = (await request.json()) as Record<string, unknown>;
      const device = await bindDeviceByCode(prisma, {
        appUserId: user.id,
        code: String(body.code ?? "")
      });
      await safeWriteAuditLog(prisma, {
        appUser: {
          id: user.id,
          org_id: device.org_id,
          phone: user.phone
        },
        action: "app.device.bind",
        resourceType: "device",
        resourceId: device.device_id,
        request,
        detail: { phone: user.phone }
      });

      return NextResponse.json(apiOk(device, requestId));
    } catch (error) {
      return apiErrorResponse(error, requestId);
    }
  });
}

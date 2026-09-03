import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { allowRequest, clientIpFromRequest } from "@/lib/rate-limit";
import { withAppUser } from "@/lib/identity/app-session";
import {
  changeAppUserPassword,
  mapAppAuthSession
} from "@/lib/identity/app-auth-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withAppUser(request, async (user) => {
    const requestId = createRequestId();

    try {
      // 需要登录态但仍按 IP 限流,防拿到令牌后爆破原密码
      const allowed = await allowRequest(
        `app-change-password:${clientIpFromRequest(request)}`,
        10,
        60
      );

      if (!allowed) {
        throw Object.assign(new Error("请求过于频繁，请稍后再重试"), {
          code: 429001
        });
      }

      const body = (await request.json()) as Record<string, unknown>;
      const session = await changeAppUserPassword(prisma, {
        appUserId: user.id,
        oldPassword: String(body.old_password ?? ""),
        newPassword: String(body.new_password ?? "")
      });
      await safeWriteAuditLog(prisma, {
        appUser: { id: user.id, org_id: "", phone: user.phone },
        action: "app.auth.change_password",
        resourceType: "app_user",
        resourceId: user.id,
        request
      });

      return NextResponse.json(apiOk(mapAppAuthSession(session), requestId));
    } catch (error) {
      return apiErrorResponse(error, requestId);
    }
  });
}

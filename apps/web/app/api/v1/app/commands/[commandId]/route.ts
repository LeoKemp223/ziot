import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { withAppUser } from "@/lib/identity/app-session";
import { expireStaleCommands } from "@/features/control/control-service";

export const runtime = "nodejs";

type CommandRouteContext = {
  params: Promise<{
    commandId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: CommandRouteContext) {
  return withAppUser(request, async (user) => {
    const requestId = createRequestId();

    try {
      await expireStaleCommands(prisma);
      const { commandId } = await params;
      const command = await prisma.deviceCommand.findUnique({
        where: { id: commandId },
        include: { device: { include: { product: true } } }
      });

      if (!command) {
        throw Object.assign(new Error("命令不存在"), { code: 404001 });
      }

      // 归属校验:App 用户只能查看自己发起的命令,或对命令设备仍有有效绑定
      const ownsCommand = command.app_user_id === user.id;
      const bound = await prisma.userDevice.findFirst({
        where: {
          app_user_id: user.id,
          device_id: command.device_id,
          status: "active"
        }
      });

      if (!ownsCommand && !bound) {
        throw Object.assign(new Error("没有操作权限"), { code: 403001 });
      }

      return NextResponse.json(
        apiOk(
          {
            id: command.id,
            org_id: command.org_id,
            device_id: command.device_id,
            device_name: command.device?.name ?? "",
            product_key: command.device?.product?.product_key ?? "",
            device_key: command.device?.device_key ?? "",
            identifier: command.identifier,
            params: command.params,
            status: command.status,
            request_id: command.request_id,
            result: command.result,
            error_code: command.error_code,
            error_message: command.error_message,
            timeout_at: command.timeout_at.toISOString(),
            sent_at: command.sent_at?.toISOString() ?? null,
            replied_at: command.replied_at?.toISOString() ?? null,
            created_at: command.created_at.toISOString(),
            updated_at: command.updated_at.toISOString()
          },
          requestId
        )
      );
    } catch (error) {
      return apiErrorResponse(error, requestId);
    }
  });
}

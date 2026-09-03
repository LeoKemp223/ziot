import { NextRequest } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { hasDeviceEvents, subscribeDeviceEvents } from "@/lib/events/device-events";
import { getAppUser } from "@/lib/identity/app-session";
import { createRequestId } from "@/lib/request-id";
import { listAppDevices } from "@/features/devices/binding-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App 端设备事件流(SSE)。
// 仅连接时校验 Bearer;推送按当前有效绑定过滤,绑定集每 60s 重载一次
// (流上无法重放历史,客户端断线重连后应拉一次 shadow 兜底)。

const HEARTBEAT_MS = 20_000;
const BINDINGS_REFRESH_MS = 60_000;

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  let appUserId: string;

  try {
    const user = await getAppUser(request);
    appUserId = user.id;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }

  if (!hasDeviceEvents()) {
    return apiErrorResponse(
      Object.assign(new Error("事件推送未配置 REDIS_URL"), { code: 500001 }),
      requestId
    );
  }

  async function loadBoundDeviceIds(): Promise<Set<string>> {
    const result = await listAppDevices(prisma, { appUserId });

    return new Set(
      (result.items as Array<{ device_id: string }>).map((device) => device.device_id)
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let deviceIds = new Set<string>();

      const write = (event: string, data: unknown) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const removeListener = subscribeDeviceEvents((event) => {
        if (deviceIds.has(event.device_id)) {
          write(event.type, event);
        }
      });

      void loadBoundDeviceIds()
        .then((ids) => {
          deviceIds = ids;
          write("ready", { device_ids: [...ids] });
        })
        .catch(() => {
          write("error", { message: "加载绑定设备失败" });
        });

      const heartbeatTimer = setInterval(() => {
        write("heartbeat", { now: new Date().toISOString() });
      }, HEARTBEAT_MS);

      // 绑定关系可能在连接期间变化(新绑定/解绑),定期重载过滤集
      const bindingsTimer = setInterval(() => {
        void loadBoundDeviceIds()
          .then((ids) => {
            deviceIds = ids;
          })
          .catch(() => undefined);
      }, BINDINGS_REFRESH_MS);

      const cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeatTimer);
        clearInterval(bindingsTimer);
        removeListener?.();
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      };

      request.signal.addEventListener("abort", cleanup);
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // nginx 等反代默认缓冲响应体,会攒住 SSE 不下发,必须显式关闭
      "x-accel-buffering": "no"
    }
  });
}

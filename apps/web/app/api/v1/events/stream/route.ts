import { NextRequest } from "next/server";
import { prisma } from "@ziot/db";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);

  if (!user.permissions.includes("device:read")) {
    return new Response("permission denied", { status: 403 });
  }

  const encoder = new TextEncoder();
  let lastSeen = new Date();
  const stream = new ReadableStream({
    start(controller) {
      const write = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      const timer = setInterval(async () => {
        try {
          const commands = await prisma.deviceCommand.findMany({
            where: {
              org_id: user.current_org_id,
              updated_at: { gt: lastSeen },
              device: canAccessAllResources(user.permissions)
                ? {}
                : { created_by: user.id }
            },
            orderBy: { updated_at: "asc" },
            take: 50
          });

          lastSeen = new Date();
          for (const command of commands) {
            write("command.status.changed", {
              command_id: command.id,
              device_id: command.device_id,
              status: command.status,
              updated_at: command.updated_at.toISOString()
            });
          }
          write("heartbeat", { now: new Date().toISOString() });
        } catch (error) {
          write("error", {
            message: error instanceof Error ? error.message : "stream error"
          });
        }
      }, 2000);

      request.signal.addEventListener("abort", () => {
        clearInterval(timer);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}

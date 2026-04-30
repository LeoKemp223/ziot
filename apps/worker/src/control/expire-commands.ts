import { prisma } from "@ziot/db";

export async function expireStaleCommands() {
  const result = await prisma.deviceCommand.updateMany({
    where: {
      status: { in: ["pending", "sent", "delivered"] },
      timeout_at: { lt: new Date() }
    },
    data: {
      status: "timeout",
      error_code: "timeout",
      error_message: "command timed out"
    }
  });

  return result.count;
}

export function startCommandExpiry() {
  const intervalMs = Number(process.env.COMMAND_EXPIRY_INTERVAL_MS ?? "5000");
  const timer = setInterval(() => {
    void expireStaleCommands().catch((error) => {
      console.error("command expiry failed", error);
    });
  }, intervalMs);

  return timer;
}

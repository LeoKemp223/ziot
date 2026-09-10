import Redis from "ioredis";

// 与 apps/web/lib/events/device-events.ts 同频道同格式的发布端(worker 无法直接复用 web 模块)。
// 频道名与事件 JSON 结构是跨进程契约,改动需两边同步。
const DEVICE_EVENTS_CHANNEL = "ziot:device-events";

let publisher: Redis | null = null;

// 尽力而为:事件推送失败不影响上报主流程
export async function publishDeviceEvent(event: unknown): Promise<void> {
  publisher ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1
  });

  try {
    await publisher.publish(DEVICE_EVENTS_CHANNEL, JSON.stringify(event));
  } catch {
    // 静默丢弃
  }
}

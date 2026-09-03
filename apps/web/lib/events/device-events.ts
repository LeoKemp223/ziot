import { EventEmitter } from "node:events";
import Redis from "ioredis";

// 设备事件总线:ingress(webhook 路由进程内)发布,App SSE 路由订阅。
// 单实例部署时发布与订阅同进程;多实例时经 Redis pub/sub 扇出,
// 每个 web 实例各持一条订阅连接,再本地分发给自己的 SSE 客户端。

export const DEVICE_EVENTS_CHANNEL = "ziot:device-events";

export type DeviceShadowUpdatedEvent = {
  type: "device.shadow.updated";
  device_id: string;
  reported: unknown;
  version: number;
  updated_at: string;
};

export type DeviceStatusChangedEvent = {
  type: "device.status.changed";
  device_id: string;
  online_status: string;
  occurred_at: string;
};

export type DeviceEvent =
  | DeviceShadowUpdatedEvent
  | DeviceStatusChangedEvent;

type EventListener = (event: DeviceEvent) => void;

type Hub = {
  emitter: EventEmitter;
  subscriber: Redis;
  publisher: Redis | null;
};

// globalThis 缓存,避免 next dev 热重载叠加连接
const globalForHub = globalThis as typeof globalThis & {
  __ziotDeviceEventsHub?: Hub;
};

function redisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url ? url : null;
}

// 是否具备事件总线能力(配置了 REDIS_URL),调用方据此决定降级行为
export function hasDeviceEvents(): boolean {
  return redisUrl() !== null;
}

function getHub(): Hub | null {
  const url = redisUrl();

  if (!url) {
    return null;
  }

  if (!globalForHub.__ziotDeviceEventsHub) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    const subscriber = new Redis(url, { maxRetriesPerRequest: null });
    subscriber.psubscribe(DEVICE_EVENTS_CHANNEL);
    subscriber.on("pmessage", (_pattern, _channel, message) => {
      try {
        emitter.emit("event", JSON.parse(message) as DeviceEvent);
      } catch {
        // 非法消息直接丢弃,不影响总线
      }
    });
    globalForHub.__ziotDeviceEventsHub = {
      emitter,
      subscriber,
      publisher: null
    };
  }

  return globalForHub.__ziotDeviceEventsHub;
}

// 发布侧尽力而为:事件推送失败不影响主流程(上报/状态变更必须成功)
export async function publishDeviceEvent(event: DeviceEvent): Promise<void> {
  const hub = getHub();

  if (!hub) {
    return;
  }

  if (!hub.publisher) {
    hub.publisher = new Redis(redisUrl() as string);
  }

  try {
    await hub.publisher.publish(DEVICE_EVENTS_CHANNEL, JSON.stringify(event));
  } catch {
    // 推送失败静默丢弃
  }
}

// 订阅侧:注册本地监听,返回取消函数。未配置 REDIS_URL 时返回 null(调用方应降级/报错)。
export function subscribeDeviceEvents(
  listener: EventListener
): (() => void) | null {
  const hub = getHub();

  if (!hub) {
    return null;
  }

  hub.emitter.on("event", listener);

  return () => {
    hub.emitter.off("event", listener);
  };
}

import Redis from "ioredis";

type Db = { [key: string]: any };

const onlineTtlSeconds = Number(process.env.DEVICE_ONLINE_TTL_SECONDS ?? "120");
let redis: Redis | null = null;

function getRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  if (!redis) {
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    // lazyConnect 不会自动建连,首次命令会在连接建立前直接失败,这里主动触发
    void redis.connect().catch(() => undefined);
  }

  return redis;
}

function key(deviceId: string) {
  return `device:online:${deviceId}`;
}

export async function markDeviceOnlineInCache(deviceId: string) {
  const client = getRedis();

  if (!client) {
    return;
  }

  await client.set(key(deviceId), "1", "EX", onlineTtlSeconds).catch(() => undefined);
}

export async function markDeviceOfflineInCache(deviceId: string) {
  const client = getRedis();

  if (!client) {
    return;
  }

  await client.del(key(deviceId)).catch(() => undefined);
}

export async function compensateOnlineStatuses(db: Db, orgId: string) {
  if (typeof db.device?.updateMany !== "function") {
    return;
  }

  const staleBefore = new Date(Date.now() - onlineTtlSeconds * 1000);

  await db.device.updateMany({
    where: {
      org_id: orgId,
      deleted_at: null,
      online_status: "online",
      OR: [
        { last_heartbeat_at: null },
        { last_heartbeat_at: { lt: staleBefore } }
      ]
    },
    data: {
      online_status: "offline",
      last_offline_at: new Date()
    }
  });
}

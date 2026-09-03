import Redis from "ioredis";

let redisClient: Redis | null = null;

function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    // lazyConnect 不会自动建连,首次命令会在连接建立前直接失败,这里主动触发
    void redisClient.connect().catch(() => undefined);
  }

  return redisClient;
}

/**
 * Redis 固定窗口限流。窗口内首次请求设置过期时间,超限返回 false。
 * Redis 不可用或未配置时放行(fail-open),与控制台既有 Redis 降级策略一致。
 */
export async function allowRequest(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const redis = getRedisClient();

  if (!redis || redis.status !== "ready") {
    return true;
  }

  try {
    const key = `rl:${bucket}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    return count <= limit;
  } catch {
    return true;
  }
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return "unknown";
}

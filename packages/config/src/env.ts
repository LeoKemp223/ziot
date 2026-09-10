import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  EMQX_API_URL: z.string().url(),
  // 公共端点:固件预签名直链签名用的地址,浏览器/设备可达
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().optional(),
  MINIO_USE_SSL: z.string().optional(),
  MINIO_BUCKET: z.string().min(1).optional(),
  // 内网端点:web/worker 容器内 putObject/removeObject 走的地址,缺省同公共端点
  MINIO_INTERNAL_ENDPOINT: z.string().optional(),
  MINIO_INTERNAL_PORT: z.coerce.number().int().optional(),
  MINIO_INTERNAL_USE_SSL: z.string().optional(),
  MINIO_REGION: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(8),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters"),
  PUBLIC_APP_URL: z.string().url()
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, unknown>): AppEnv {
  return envSchema.parse(input);
}

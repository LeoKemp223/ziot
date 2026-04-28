import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  EMQX_API_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(8),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters"),
  PUBLIC_APP_URL: z.string().url()
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, unknown>): AppEnv {
  return envSchema.parse(input);
}

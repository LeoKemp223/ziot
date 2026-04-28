import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const validEnv = {
  DATABASE_URL: "postgresql://ziot:ziot@postgres:5432/ziot",
  REDIS_URL: "redis://redis:6379",
  EMQX_API_URL: "http://emqx:18083",
  MINIO_ENDPOINT: "minio",
  MINIO_ACCESS_KEY: "ziot",
  MINIO_SECRET_KEY: "ziot-secret",
  JWT_SECRET: "x".repeat(32),
  PUBLIC_APP_URL: "http://localhost:3000"
};

describe("parseEnv", () => {
  it("parses required environment values", () => {
    expect(parseEnv(validEnv)).toMatchObject({
      DATABASE_URL: validEnv.DATABASE_URL,
      REDIS_URL: validEnv.REDIS_URL,
      PUBLIC_APP_URL: validEnv.PUBLIC_APP_URL
    });
  });

  it("rejects short JWT secrets", () => {
    expect(() => parseEnv({ ...validEnv, JWT_SECRET: "short" })).toThrow(
      /JWT_SECRET/
    );
  });
});

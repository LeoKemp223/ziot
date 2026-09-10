import { afterAll, describe, expect, it } from "vitest";
import {
  deltaPatchObjectKey,
  firmwareObjectKey,
  isMinioStorageUrl,
  parseMinioStorageUrl,
  presignedFirmwareGetUrl
} from "./firmware-storage";

const originalEnv = { ...process.env };

function setEnv(entries: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterAll(() => {
  setEnv(originalEnv);
});

describe("firmware object keys", () => {
  it("builds full-package keys with uuid prefix and sanitized names", () => {
    const key = firmwareObjectKey("pk_demo", "Smart Box App .bin");

    expect(key).toMatch(/^firmwares\/pk_demo\/[0-9a-f-]{36}-Smart-Box-App-.bin$/);
  });

  it("falls back to placeholders for empty segments", () => {
    const key = firmwareObjectKey("  ", "");

    expect(key).toMatch(/^firmwares\/unknown-product\/[0-9a-f-]{36}-firmware\.bin$/);
  });

  it("strips directory components from file names", () => {
    const key = firmwareObjectKey("pk_demo", "../../etc/passwd");

    expect(key).toMatch(/^firmwares\/pk_demo\/[0-9a-f-]{36}-passwd$/);
  });

  it("builds delta patch keys with base and target versions", () => {
    const key = deltaPatchObjectKey("pk_demo", "v1.0.0", "v1.0.1");

    expect(key).toMatch(/^firmwares\/pk_demo\/[0-9a-f-]{36}-delta-v1\.0\.0-v1\.0\.1\.patch$/);
  });
});

describe("minio storage url", () => {
  it("round-trips object keys through url and parser", () => {
    setEnv({ MINIO_BUCKET: "ziot-firmwares" });
    const objectKey = "firmwares/pk_demo/abc-fw.bin";
    const url = `minio://ziot-firmwares/${objectKey}`;

    expect(isMinioStorageUrl(url)).toBe(true);
    expect(parseMinioStorageUrl(url)).toEqual({ bucket: "ziot-firmwares", objectKey });
  });

  it("rejects malformed or non-minio urls", () => {
    expect(isMinioStorageUrl("https://example.com/fw.bin")).toBe(false);
    expect(parseMinioStorageUrl("https://example.com/fw.bin")).toBeNull();
    expect(parseMinioStorageUrl("minio://bucket-only")).toBeNull();
    expect(parseMinioStorageUrl("minio://bucket/")).toBeNull();
  });
});

describe("presigned download url", () => {
  it("passes through non-minio urls as null", async () => {
    expect(await presignedFirmwareGetUrl("https://example.com/fw.bin", 3600)).toBeNull();
    expect(await presignedFirmwareGetUrl("/uploads/firmwares/a/b.bin", 3600)).toBeNull();
  });

  it("signs minio urls offline against the public endpoint", async () => {
    setEnv({
      MINIO_ENDPOINT: "localhost",
      MINIO_PORT: "9000",
      MINIO_BUCKET: "ziot-firmwares",
      MINIO_ACCESS_KEY: "ziot",
      MINIO_SECRET_KEY: "ziot-secret"
    });

    const url = await presignedFirmwareGetUrl(
      "minio://ziot-firmwares/firmwares/pk_demo/abc-fw.bin",
      3600
    );

    expect(url).toMatch(
      /^http:\/\/localhost:9000\/ziot-firmwares\/firmwares\/pk_demo\/abc-fw\.bin\?X-Amz-Algorithm=/
    );
  });
});

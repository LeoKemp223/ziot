import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const incrMock = vi.fn();
const expireMock = vi.fn();

vi.mock("ioredis", () => ({
  default: class MockRedis {
    status = "ready";
    incr = incrMock;
    expire = expireMock;
    connect = vi.fn().mockResolvedValue(undefined);
  }
}));

import { allowRequest, clientIpFromRequest } from "./rate-limit";

describe("rate limit", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();
    incrMock.mockReset();
    expireMock.mockReset();
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("allows requests under the limit and sets expiry on first hit", async () => {
    incrMock.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await allowRequest("test", 2, 60)).toBe(true);
    expect(await allowRequest("test", 2, 60)).toBe(true);
    expect(expireMock).toHaveBeenCalledWith("rl:test", 60);
  });

  it("blocks requests over the limit", async () => {
    incrMock.mockResolvedValue(3);

    expect(await allowRequest("test", 2, 60)).toBe(false);
  });

  it("fails open when redis errors", async () => {
    incrMock.mockRejectedValue(new Error("redis down"));

    expect(await allowRequest("test", 2, 60)).toBe(true);
  });

  it("extracts client ip from x-forwarded-for", () => {
    const request = new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }
    });

    expect(clientIpFromRequest(request)).toBe("1.2.3.4");
    expect(clientIpFromRequest(new Request("http://localhost/api"))).toBe(
      "unknown"
    );
  });
});

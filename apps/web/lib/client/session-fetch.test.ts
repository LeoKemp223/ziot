import { afterEach, describe, expect, it, vi } from "vitest";
import { installSessionFetch } from "./session-fetch";

function jsonResponse(status: number) {
  return new Response(JSON.stringify({ code: status === 200 ? 0 : 401001 }), {
    status
  });
}

function setupWindow(apiStatuses: number[], refreshStatus = 200) {
  const refreshCalls: string[] = [];
  let apiCalls = 0;
  const fetchMock = vi.fn(async (input: unknown, _init?: unknown) => {
    const url = String(input);

    if (url === "/api/v1/auth/refresh") {
      refreshCalls.push(url);
      return jsonResponse(refreshStatus);
    }

    apiCalls += 1;
    return jsonResponse(
      apiStatuses[Math.min(apiCalls - 1, apiStatuses.length - 1)] ?? 401
    );
  });
  const location = { pathname: "/devices", search: "?tab=1", href: "" };
  const scope = { fetch: fetchMock, location, __ziotSessionFetchInstalled: false };

  vi.stubGlobal("window", scope);

  return { scope, fetchMock, refreshCalls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session fetch interceptor", () => {
  it("refreshes the session once and retries the failed api request", async () => {
    const { scope, fetchMock, refreshCalls } = setupWindow([401, 200]);

    installSessionFetch();
    const response = await scope.fetch("/api/v1/devices");

    expect(response.status).toBe(200);
    // 一次失败的 API 调用 + 一次刷新 + 一次重试
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(refreshCalls.length).toBe(1);
  });

  it("shares a single in-flight refresh across concurrent 401s", async () => {
    const { scope, refreshCalls } = setupWindow([401, 401, 200, 200]);

    installSessionFetch();
    const [first, second] = await Promise.all([
      scope.fetch("/api/v1/devices"),
      scope.fetch("/api/v1/ota/tasks")
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // 旋转式刷新令牌,并发 401 只允许真正发一次 /auth/refresh
    expect(refreshCalls.length).toBe(1);
  });

  it("redirects to login when refresh and retry both fail", async () => {
    const { scope } = setupWindow([401, 401], 401);

    installSessionFetch();
    const response = await scope.fetch("/api/v1/devices");

    expect(response.status).toBe(401);
    expect(scope.location.href).toBe("/login?next=%2Fdevices%3Ftab%3D1");
  });

  it("leaves non-api and auth requests untouched", async () => {
    const { scope, refreshCalls } = setupWindow([401]);

    installSessionFetch();
    const apiResponse = await scope.fetch("/api/v1/auth/login", {
      method: "POST"
    });
    const externalResponse = await scope.fetch("https://example.com/file.bin");

    expect(apiResponse.status).toBe(401);
    expect(externalResponse.status).toBe(401);
    expect(refreshCalls.length).toBe(0);
  });

  it("does not retry non-401 errors", async () => {
    const { scope, fetchMock } = setupWindow([500]);

    installSessionFetch();
    const response = await scope.fetch("/api/v1/devices");

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

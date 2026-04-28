import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/health", () => {
  it("returns a unified healthy response", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.code).toBe(0);
    expect(body.message).toBe("ok");
    expect(body.request_id).toMatch(/^req_/);
    expect(body.data).toMatchObject({ status: "ok", service: "ziot-web" });
  });
});

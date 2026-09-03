import { describe, expect, it } from "vitest";
import { apiErrorResponse } from "./api-errors";

describe("apiErrorResponse", () => {
  it("does not expose unexpected internal error details", async () => {
    const response = apiErrorResponse(
      new Error("database password leaked in stack"),
      "req_test"
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      code: 500001,
      message: "服务器内部错误",
      request_id: "req_test",
      data: null
    });
  });

  it("maps rate limit code 429001 to http 429", async () => {
    const response = apiErrorResponse(
      Object.assign(new Error("请求过于频繁，请稍后再试"), { code: 429001 }),
      "req_test"
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.code).toBe(429001);
  });
});

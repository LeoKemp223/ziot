import { describe, expect, it } from "vitest";
import { apiError, apiOk } from "./api-response";

describe("api-response", () => {
  it("returns the unified success envelope", () => {
    expect(apiOk({ healthy: true }, "req_test")).toEqual({
      code: 0,
      message: "ok",
      request_id: "req_test",
      data: { healthy: true }
    });
  });

  it("returns the unified error envelope", () => {
    expect(apiError(400001, "参数错误", "req_bad")).toEqual({
      code: 400001,
      message: "参数错误",
      request_id: "req_bad",
      data: null
    });
  });
});

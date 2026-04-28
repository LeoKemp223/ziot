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
      message: "internal server error",
      request_id: "req_test",
      data: null
    });
  });
});

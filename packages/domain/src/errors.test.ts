import { describe, expect, it } from "vitest";
import { ERROR_DEFINITIONS, getErrorDefinition } from "./errors";

describe("errors", () => {
  it("contains the PRD error codes", () => {
    expect(Object.keys(ERROR_DEFINITIONS).map(Number).sort()).toEqual([
      0, 400001, 401001, 403001, 404001, 409001, 429001, 500001, 504001
    ]);
  });

  it("returns the matching status and message", () => {
    expect(getErrorDefinition(403001)).toEqual({
      code: 403001,
      httpStatus: 403,
      message: "无权限"
    });
  });
});

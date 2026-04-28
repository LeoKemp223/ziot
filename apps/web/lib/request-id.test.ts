import { describe, expect, it } from "vitest";
import { createRequestId } from "./request-id";

describe("createRequestId", () => {
  it("creates request ids with a stable prefix", () => {
    expect(createRequestId()).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
  });

  it("creates different ids on consecutive calls", () => {
    expect(createRequestId()).not.toBe(createRequestId());
  });
});

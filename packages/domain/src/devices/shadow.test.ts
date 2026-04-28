import { describe, expect, it } from "vitest";
import { mergeReportedShadow } from "./shadow";

describe("mergeReportedShadow", () => {
  it("merges reported state and increments version", () => {
    expect(
      mergeReportedShadow(
        { reported: { switch: false }, desired: {}, version: 1 },
        { switch: true, temperature: 26.5 }
      )
    ).toEqual({
      reported: { switch: true, temperature: 26.5 },
      desired: {},
      version: 2
    });
  });
});

import { describe, expect, it } from "vitest";
import { canTransitionOtaRecord } from "./ota-state";

describe("ota state", () => {
  it("allows the normal OTA progress path", () => {
    expect(canTransitionOtaRecord("created", "scheduled")).toBe(true);
    expect(canTransitionOtaRecord("scheduled", "notified")).toBe(true);
    expect(canTransitionOtaRecord("notified", "downloading")).toBe(true);
    expect(canTransitionOtaRecord("downloading", "installing")).toBe(true);
    expect(canTransitionOtaRecord("installing", "success")).toBe(true);
  });

  it("rejects progress after a terminal state", () => {
    expect(canTransitionOtaRecord("success", "failed")).toBe(false);
    expect(canTransitionOtaRecord("cancelled", "scheduled")).toBe(false);
  });
});

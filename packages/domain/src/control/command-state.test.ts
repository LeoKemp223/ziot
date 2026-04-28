import { describe, expect, it } from "vitest";
import { canTransitionCommand } from "./command-state";

describe("command state", () => {
  it("allows pending commands to be sent or cancelled", () => {
    expect(canTransitionCommand("pending", "sent")).toBe(true);
    expect(canTransitionCommand("pending", "cancelled")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransitionCommand("success", "failed")).toBe(false);
    expect(canTransitionCommand("timeout", "sent")).toBe(false);
  });
});

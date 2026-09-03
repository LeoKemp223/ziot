import { describe, expect, it } from "vitest";
import { canTransitionCommand } from "./command-state";

describe("command state", () => {
  it("allows pending commands to reach delivery success directly", () => {
    expect(canTransitionCommand("pending", "success")).toBe(true);
    expect(canTransitionCommand("pending", "failed")).toBe(true);
    expect(canTransitionCommand("pending", "cancelled")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransitionCommand("success", "failed")).toBe(false);
    expect(canTransitionCommand("timeout", "sent")).toBe(false);
  });
});

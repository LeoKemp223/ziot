import { describe, expect, it } from "vitest";
import { canAccessOrg, hasPermission, mergePermissions } from "./permissions";

describe("permissions", () => {
  it("merges permissions from multiple roles in the current organization", () => {
    expect(
      mergePermissions([
        ["device:read", "log:read"],
        ["device:control", "device:read"]
      ])
    ).toEqual(["device:control", "device:read", "log:read"]);
  });

  it("allows platform administrators to access any organization", () => {
    expect(canAccessOrg({ isPlatformAdmin: true, orgIds: [] }, "org_b")).toBe(
      true
    );
  });

  it("rejects users outside the target organization", () => {
    expect(canAccessOrg({ isPlatformAdmin: false, orgIds: ["org_a"] }, "org_b"))
      .toBe(false);
  });

  it("checks permission membership", () => {
    expect(hasPermission(["device:read"], "device:read")).toBe(true);
    expect(hasPermission(["device:read"], "device:control")).toBe(false);
  });
});

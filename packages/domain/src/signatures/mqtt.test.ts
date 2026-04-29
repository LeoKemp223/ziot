import { describe, expect, it } from "vitest";
import { parseMqttUsername, verifyMqttPassword } from "./mqtt";

describe("mqtt signatures", () => {
  it("parses product and device keys from username", () => {
    expect(parseMqttUsername("pk_001:dk_001")).toEqual({
      productKey: "pk_001",
      deviceKey: "dk_001"
    });
  });

  it("rejects invalid usernames", () => {
    expect(parseMqttUsername("bad")).toBeNull();
  });

  it("verifies direct device secret password", () => {
    expect(verifyMqttPassword("secret", "pk_001:dk_001", "secret")).toBe(true);
    expect(verifyMqttPassword("secret", "pk_001:dk_001", "wrong")).toBe(false);
  });
});

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

  it("verifies HMAC password", () => {
    const password =
      "033a4ce6822028ca02cdfea22fe80a3e0672d5ee446219d4be8121b387916e06";

    expect(verifyMqttPassword("secret", "pk_001:dk_001", password)).toBe(true);
  });
});

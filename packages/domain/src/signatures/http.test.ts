import { describe, expect, it } from "vitest";
import {
  createHttpCanonicalString,
  sha256Hex,
  signHmacSha256,
  verifyHmacSha256
} from "./http";

describe("http signatures", () => {
  it("creates the canonical HTTP device string", () => {
    expect(
      createHttpCanonicalString({
        method: "post",
        path: "/device-api/v1/properties",
        timestamp: "1777371600000",
        nonce: "nonce_1",
        bodySha256: "abc123"
      })
    ).toBe("POST\n/device-api/v1/properties\n1777371600000\nnonce_1\nabc123");
  });

  it("signs HMAC-SHA256 as lowercase hex", () => {
    expect(signHmacSha256("secret", "message")).toBe(
      "8b5f48702995c1598c573db1e21866a9b825d4a794d169d7060a03605796360b"
    );
  });

  it("hashes request bodies and verifies signatures safely", () => {
    const bodyHash = sha256Hex("{\"temperature\":23.6}");
    const canonical = createHttpCanonicalString({
      method: "POST",
      path: "/device-api/v1/properties",
      timestamp: "1777371600000",
      nonce: "nonce_1",
      bodySha256: bodyHash
    });
    const signature = signHmacSha256("DeviceSecret123", canonical);

    expect(bodyHash).toBe(
      "9c0725aa2e52e6a94ae3a52550a75fdbcc937ca4b6b33ac21e4a567a908933aa"
    );
    expect(verifyHmacSha256("DeviceSecret123", canonical, signature)).toBe(true);
    expect(verifyHmacSha256("wrong", canonical, signature)).toBe(false);
    expect(verifyHmacSha256("DeviceSecret123", canonical, "not-hex")).toBe(false);
  });
});

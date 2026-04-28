import { describe, expect, it } from "vitest";
import { createHttpCanonicalString, signHmacSha256 } from "./http";

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
});

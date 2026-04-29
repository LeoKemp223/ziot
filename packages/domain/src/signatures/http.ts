import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type HttpCanonicalInput = {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
};

export function createHttpCanonicalString(input: HttpCanonicalInput): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    input.bodySha256
  ].join("\n");
}

export function signHmacSha256(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function sha256Hex(message: string): string {
  return createHash("sha256").update(message).digest("hex");
}

export function verifyHmacSha256(
  secret: string,
  message: string,
  signature: string
): boolean {
  const expected = signHmacSha256(secret, message);

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

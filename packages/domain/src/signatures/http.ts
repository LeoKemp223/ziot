import { createHmac } from "node:crypto";

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

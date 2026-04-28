export function createRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12);

  return `req_${timestamp}_${random}`;
}

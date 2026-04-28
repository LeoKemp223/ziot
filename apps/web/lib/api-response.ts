export type ApiEnvelope<T> = {
  code: number;
  message: string;
  request_id: string;
  data: T;
};

export function apiOk<T>(data: T, requestId: string): ApiEnvelope<T> {
  return {
    code: 0,
    message: "ok",
    request_id: requestId,
    data
  };
}

export function apiError(
  code: number,
  message: string,
  requestId: string
): ApiEnvelope<null> {
  return {
    code,
    message,
    request_id: requestId,
    data: null
  };
}

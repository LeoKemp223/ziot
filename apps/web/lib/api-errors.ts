import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";

const httpStatusByCode = {
  400001: 400,
  401001: 401,
  403001: 403,
  404001: 404,
  409001: 409,
  500001: 500
} as const;

export function apiErrorResponse(
  error: unknown,
  requestId: string
): NextResponse {
  const maybeError = error as { code?: number; message?: string };
  const code =
    maybeError.code && maybeError.code in httpStatusByCode
      ? (maybeError.code as keyof typeof httpStatusByCode)
      : 500001;
  const message =
    code === 500001
      ? "internal server error"
      : maybeError.message ?? "request failed";

  return NextResponse.json(apiError(code, message, requestId), {
    status: httpStatusByCode[code]
  });
}

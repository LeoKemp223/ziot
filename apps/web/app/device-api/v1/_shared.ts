import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  authenticateHttpDevice,
  type HttpDeviceContext
} from "@/features/ingress/http-device/http-device-service";

export async function readJsonBody(request: NextRequest) {
  const text = await request.text();

  if (!text) {
    return { text, json: {} };
  }

  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    throw Object.assign(new Error("body must be valid JSON"), { code: 400001 });
  }
}

export async function withHttpDevice<T>(
  request: NextRequest,
  bodyText: string,
  handler: (context: HttpDeviceContext) => Promise<T>
) {
  const requestId = createRequestId();

  try {
    const context = await authenticateHttpDevice(prisma, {
      method: request.method,
      path: request.nextUrl.pathname,
      headers: request.headers,
      body: bodyText
    });

    return NextResponse.json(apiOk(await handler(context), requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

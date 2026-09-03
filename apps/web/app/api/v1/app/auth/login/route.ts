import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { allowRequest, clientIpFromRequest } from "@/lib/rate-limit";
import {
  loginAppUser,
  mapAppAuthSession
} from "@/lib/identity/app-auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const allowed = await allowRequest(
      `app-login:${clientIpFromRequest(request)}`,
      10,
      60
    );

    if (!allowed) {
      throw Object.assign(new Error("请求过于频繁，请稍后再试"), {
        code: 429001
      });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const session = await loginAppUser(prisma, {
      phone: String(body.phone ?? ""),
      password: String(body.password ?? "")
    });

    return NextResponse.json(apiOk(mapAppAuthSession(session), requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

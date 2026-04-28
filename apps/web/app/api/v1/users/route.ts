import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { listUsers } from "@/lib/identity/auth-service";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("user:read")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    return NextResponse.json(
      apiOk(await listUsers(prisma, user.current_org_id), requestId)
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { getCurrentUser } from "@/lib/identity/session";
import { listRoles } from "@/lib/identity/auth-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (
      !user.permissions.includes("user:read") &&
      !user.permissions.includes("invite:write")
    ) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    return NextResponse.json(
      apiOk(await listRoles(prisma, user.current_org_id), requestId)
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

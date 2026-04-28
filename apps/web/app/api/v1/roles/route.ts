import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    const roles = await prisma.role.findMany({
      where: { org_id: user.current_org_id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true
      }
    });

    return NextResponse.json(apiOk(roles, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

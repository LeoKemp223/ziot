import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { startOtaTask } from "@/features/ota/ota-service";

export const runtime = "nodejs";

type OtaTaskStartRouteContext = {
  params: Promise<{ taskId: string }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function POST(
  request: NextRequest,
  { params }: OtaTaskStartRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("ota:execute")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { taskId } = await params;
    return NextResponse.json(
      apiOk(
        await startOtaTask(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          taskId
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

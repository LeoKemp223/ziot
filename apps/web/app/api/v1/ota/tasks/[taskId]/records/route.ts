import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { listOtaRecords } from "@/features/ota/ota-service";

export const runtime = "nodejs";

type OtaTaskRecordsRouteContext = {
  params: Promise<{ taskId: string }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(
  request: NextRequest,
  { params }: OtaTaskRecordsRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("ota:read")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { taskId } = await params;
    return NextResponse.json(
      apiOk(
        await listOtaRecords(prisma, {
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

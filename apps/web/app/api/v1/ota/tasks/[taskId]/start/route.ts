import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { startOtaTask } from "@/features/ota/ota-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

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
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { taskId } = await params;
    const task = await startOtaTask(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      taskId
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "ota.start",
      resourceType: "ota_task",
      resourceId: task.id,
      request,
      detail: { status: task.status, record_counts: task.record_counts }
    });

    return NextResponse.json(apiOk(task, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

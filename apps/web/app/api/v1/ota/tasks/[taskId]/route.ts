import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { getOtaTask, deleteOtaTask } from "@/features/ota/ota-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

type OtaTaskRouteContext = {
  params: Promise<{ taskId: string }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(request: NextRequest, { params }: OtaTaskRouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("ota:read")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { taskId } = await params;
    return NextResponse.json(
      apiOk(
        await getOtaTask(prisma, {
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

export async function DELETE(
  request: NextRequest,
  { params }: OtaTaskRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("ota:write")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { taskId } = await params;
    const task = await getOtaTask(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      taskId
    });
    await deleteOtaTask(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      taskId
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "ota.delete",
      resourceType: "ota_task",
      resourceId: taskId,
      request,
      detail: {
        name: task.name,
        status: task.status,
        record_counts: task.record_counts
      }
    });

    return NextResponse.json(apiOk({ id: taskId, deleted: true }, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

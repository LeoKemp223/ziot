import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { createOtaTask, listOtaTasks } from "@/features/ota/ota-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("没有操作权限"), { code: 403001 });
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:read");

    return NextResponse.json(
      apiOk(
        await listOtaTasks(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          page: Number(request.nextUrl.searchParams.get("page") ?? "1"),
          pageSize: Number(
            request.nextUrl.searchParams.get("page_size") ?? "20"
          ),
          ...(request.nextUrl.searchParams.has("product_id")
            ? { productId: request.nextUrl.searchParams.get("product_id") ?? "" }
            : {})
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:write");
    const body = (await request.json()) as Record<string, unknown>;
    const task = await createOtaTask(prisma, {
      orgId: user.current_org_id,
      createdBy: user.id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      firmwareId: String(body.firmware_id ?? ""),
      name: String(body.name ?? ""),
      strategy:
        typeof body.strategy === "object" && body.strategy !== null
          ? (body.strategy as any)
          : { target_type: "all" }
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "ota.create",
      resourceType: "ota_task",
      resourceId: task.id,
      request,
      detail: {
        product_id: task.product_id,
        firmware_id: task.firmware_id,
        strategy: task.strategy
      }
    });

    return NextResponse.json(
      apiOk(task, requestId),
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

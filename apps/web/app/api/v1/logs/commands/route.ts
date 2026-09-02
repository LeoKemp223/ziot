import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { listCommandLogs } from "@/features/logs/operations/log-query-service";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

function dateField(key: "startTime" | "endTime", value: string | null) {
  return value ? { [key]: new Date(value) } : {};
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("log:read")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const params = request.nextUrl.searchParams;

    return NextResponse.json(
      apiOk(
        await listCommandLogs(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          page: Number(params.get("page") ?? "1"),
          pageSize: Number(params.get("page_size") ?? "20"),
          ...(params.has("product_id") ? { productId: params.get("product_id") ?? "" } : {}),
          ...(params.has("device_id") ? { deviceId: params.get("device_id") ?? "" } : {}),
          ...(params.has("status") ? { status: params.get("status") ?? "" } : {}),
          ...(params.has("keyword") ? { keyword: params.get("keyword") ?? "" } : {}),
          ...dateField("startTime", params.get("start_time")),
          ...dateField("endTime", params.get("end_time"))
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

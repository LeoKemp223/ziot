import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { listAuditLogs } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("permission denied"), { code: 403001 });
  }
}

function optionalDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error("invalid date filter"), { code: 400001 });
  }

  return date;
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const { searchParams } = request.nextUrl;

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "audit:read");
    const startTime = optionalDate(searchParams.get("start_time"));
    const endTime = optionalDate(searchParams.get("end_time"));

    return NextResponse.json(
      apiOk(
        await listAuditLogs(prisma, {
          orgId: user.current_org_id,
          ...(searchParams.has("user_id")
            ? { userId: searchParams.get("user_id") ?? "" }
            : {}),
          ...(searchParams.has("action")
            ? { action: searchParams.get("action") ?? "" }
            : {}),
          ...(searchParams.has("resource_type")
            ? { resourceType: searchParams.get("resource_type") ?? "" }
            : {}),
          ...(searchParams.has("resource_id")
            ? { resourceId: searchParams.get("resource_id") ?? "" }
            : {}),
          ...(searchParams.has("ip") ? { ip: searchParams.get("ip") ?? "" } : {}),
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
          page: Number(searchParams.get("page") ?? "1"),
          pageSize: Number(searchParams.get("page_size") ?? "20")
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

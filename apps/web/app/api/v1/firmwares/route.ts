import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { createFirmware, listFirmwares } from "@/features/ota/ota-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("permission denied"), { code: 403001 });
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:read");

    return NextResponse.json(
      apiOk(
        await listFirmwares(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
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
    const firmware = await createFirmware(prisma, {
      orgId: user.current_org_id,
      createdBy: user.id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId: String(body.product_id ?? ""),
      version: String(body.version ?? ""),
      fileUrl: String(body.file_url ?? ""),
      fileSize: Number(body.file_size ?? 0),
      sha256: String(body.sha256 ?? ""),
      ...(typeof body.release_note === "string"
        ? { releaseNote: body.release_note }
        : {})
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "firmware.create",
      resourceType: "firmware",
      resourceId: firmware.id,
      request,
      detail: {
        product_id: firmware.product_id,
        version: firmware.version,
        file_size: firmware.file_size,
        sha256: firmware.sha256
      }
    });

    return NextResponse.json(
      apiOk(firmware, requestId),
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

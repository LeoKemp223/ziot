import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { createFirmwareUploadUrl } from "@/features/ota/ota-service";

export const runtime = "nodejs";

type FirmwareUploadRouteContext = {
  params: Promise<{ firmwareId: string }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function POST(
  request: NextRequest,
  { params }: FirmwareUploadRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("ota:write")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { firmwareId } = await params;
    return NextResponse.json(
      apiOk(
        await createFirmwareUploadUrl(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          firmwareId
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

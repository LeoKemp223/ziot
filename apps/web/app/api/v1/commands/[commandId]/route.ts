import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { getCommand } from "@/features/control/control-service";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

type CommandRouteContext = {
  params: Promise<{
    commandId: string;
  }>;
};

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(request: NextRequest, { params }: CommandRouteContext) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:read")) {
      throw Object.assign(new Error("没有操作权限"), { code: 403001 });
    }

    const { commandId } = await params;

    return NextResponse.json(
      apiOk(
        await getCommand(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          commandId
        }),
        requestId
      )
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

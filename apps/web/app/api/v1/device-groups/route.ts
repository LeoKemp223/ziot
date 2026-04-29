import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  addDeviceToGroup,
  createDeviceGroup,
  listDeviceGroups
} from "@/lib/devices/device-service";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("device:read")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    return NextResponse.json(
      apiOk(
        await listDeviceGroups(prisma, {
          orgId: user.current_org_id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions)
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

    if (!user.permissions.includes("device:write")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (typeof body.group_id === "string" && typeof body.device_id === "string") {
      return NextResponse.json(
        apiOk(
          await addDeviceToGroup(prisma, {
            orgId: user.current_org_id,
            userId: user.id,
            canAccessAll: canAccessAllResources(user.permissions),
            groupId: body.group_id,
            deviceId: body.device_id
          }),
          requestId
        )
      );
    }

    return NextResponse.json(
      apiOk(
        await createDeviceGroup(prisma, {
          orgId: user.current_org_id,
          createdBy: user.id,
          userId: user.id,
          canAccessAll: canAccessAllResources(user.permissions),
          productId: String(body.product_id ?? ""),
          name: String(body.name ?? ""),
          ...(typeof body.description === "string"
            ? { description: body.description }
            : {})
        }),
        requestId
      ),
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

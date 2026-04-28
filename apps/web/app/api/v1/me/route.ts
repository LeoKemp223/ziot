import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import {
  CURRENT_ORG_COOKIE,
  getCurrentUser
} from "@/lib/identity/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

  try {
    return NextResponse.json(apiOk(await getCurrentUser(request), requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const currentUser = await getCurrentUser(request);
    const body = (await request.json()) as Record<string, unknown>;
    const orgId = String(body.current_org_id ?? "");

    if (!currentUser.organizations.some((org) => org.id === orgId)) {
      throw Object.assign(new Error("organization access denied"), {
        code: 403001
      });
    }

    const response = NextResponse.json(
      apiOk({ ...currentUser, current_org_id: orgId }, requestId)
    );
    response.cookies.set(CURRENT_ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });

    return response;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

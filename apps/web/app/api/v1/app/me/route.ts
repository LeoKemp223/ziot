import { NextRequest, NextResponse } from "next/server";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";
import { withAppUser } from "@/lib/identity/app-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withAppUser(request, async (user) =>
    NextResponse.json(apiOk(user, createRequestId()))
  );
}

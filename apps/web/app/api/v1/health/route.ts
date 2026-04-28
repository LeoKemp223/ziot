import { NextResponse } from "next/server";
import { apiOk } from "@/lib/api-response";
import { createRequestId } from "@/lib/request-id";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    apiOk(
      {
        status: "ok",
        service: "ziot-web",
        timestamp: new Date().toISOString()
      },
      createRequestId()
    )
  );
}

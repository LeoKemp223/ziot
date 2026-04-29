import { NextRequest } from "next/server";
import { prisma } from "@ziot/db";
import {
  recordHttpDeviceReport
} from "@/features/ingress/http-device/http-device-service";
import { readJsonBody, withHttpDevice } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  return withHttpDevice(request, body.text, (context) =>
    recordHttpDeviceReport(prisma, {
      context,
      type: "log",
      payload: body.json
    })
  );
}

import { NextRequest } from "next/server";
import { prisma } from "@ziot/db";
import {
  listPendingHttpDeviceCommands
} from "@/features/ingress/http-device/http-device-service";
import { withHttpDevice } from "../../_shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withHttpDevice(request, "", (context) =>
    listPendingHttpDeviceCommands(prisma, { context })
  );
}

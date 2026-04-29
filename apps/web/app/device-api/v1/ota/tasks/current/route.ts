import { NextRequest } from "next/server";
import { prisma } from "@ziot/db";
import { getCurrentDeviceOtaTask } from "@/features/ota/ota-service";
import { withHttpDevice } from "../../../_shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withHttpDevice(request, "", (context) =>
    getCurrentDeviceOtaTask(prisma, {
      orgId: context.device.org_id,
      deviceId: context.device.id
    })
  );
}

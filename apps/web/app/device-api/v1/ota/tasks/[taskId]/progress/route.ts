import { NextRequest } from "next/server";
import { prisma } from "@ziot/db";
import { recordOtaProgress } from "@/features/ota/ota-service";
import { readJsonBody, withHttpDevice } from "../../../../_shared";

export const runtime = "nodejs";

type OtaProgressRouteContext = {
  params: Promise<{ taskId: string }>;
};

function normalizeStatus(value: unknown) {
  return [
    "notified",
    "downloading",
    "installing",
    "success",
    "failed",
    "cancelled"
  ].includes(String(value))
    ? (String(value) as any)
    : "downloading";
}

export async function POST(
  request: NextRequest,
  { params }: OtaProgressRouteContext
) {
  const body = await readJsonBody(request);
  const payload =
    typeof body.json === "object" && body.json !== null && !Array.isArray(body.json)
      ? (body.json as Record<string, unknown>)
      : {};
  const { taskId } = await params;

  return withHttpDevice(request, body.text, (context) =>
    recordOtaProgress(prisma, {
      orgId: context.device.org_id,
      deviceId: context.device.id,
      taskId,
      status: normalizeStatus(payload.status),
      progress: payload.progress,
      ...(typeof payload.error_message === "string"
        ? { errorMessage: payload.error_message }
        : {}),
      ...(typeof payload.firmware_version === "string"
        ? { firmwareVersion: payload.firmware_version }
        : {})
    })
  );
}

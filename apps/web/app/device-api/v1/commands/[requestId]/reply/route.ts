import { NextRequest } from "next/server";
import { prisma } from "@ziot/db";
import {
  recordHttpDeviceCommandReply
} from "@/features/ingress/http-device/http-device-service";
import { readJsonBody, withHttpDevice } from "../../../_shared";

export const runtime = "nodejs";

type CommandReplyRouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  { params }: CommandReplyRouteContext
) {
  const body = await readJsonBody(request);
  const { requestId } = await params;

  return withHttpDevice(request, body.text, (context) =>
    recordHttpDeviceCommandReply(prisma, {
      context,
      requestId,
      payload: body.json
    })
  );
}

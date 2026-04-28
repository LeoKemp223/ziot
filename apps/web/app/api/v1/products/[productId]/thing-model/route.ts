import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiOk } from "@/lib/api-response";
import { apiErrorResponse } from "@/lib/api-errors";
import { createRequestId } from "@/lib/request-id";
import {
  getProduct,
  updateProductThingModel
} from "@/lib/products/product-service";
import { getCurrentUser } from "@/lib/identity/session";

export const runtime = "nodejs";

type ThingModelRouteContext = {
  params: Promise<{
    productId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: ThingModelRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("product:read")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { productId } = await params;
    const product = await getProduct(prisma, {
      orgId: user.current_org_id,
      productId
    });

    return NextResponse.json(apiOk(product.thing_model, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: ThingModelRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("product:write")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { productId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const thingModel = await updateProductThingModel(prisma, {
      orgId: user.current_org_id,
      productId,
      thing_model: body.thing_model ?? body
    });

    return NextResponse.json(apiOk(thingModel, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiOk } from "@/lib/api-response";
import { apiErrorResponse } from "@/lib/api-errors";
import { createRequestId } from "@/lib/request-id";
import { deleteProduct, updateProduct } from "@/lib/products/product-service";

export const runtime = "nodejs";

const DEFAULT_ORG_ID = "org_default";

type ProductRouteContext = {
  params: Promise<{
    productId: string;
  }>;
};

function getOrgId(request: NextRequest): string {
  return request.headers.get("x-org-id")?.trim() || DEFAULT_ORG_ID;
}

export async function PATCH(
  request: NextRequest,
  { params }: ProductRouteContext
) {
  const requestId = createRequestId();

  try {
    const { productId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const product = await updateProduct(prisma, {
      orgId: getOrgId(request),
      productId,
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(Array.isArray(body.protocols)
        ? {
            protocols: body.protocols.filter(
              (protocol): protocol is string => typeof protocol === "string"
            )
          }
        : {}),
      ...(typeof body.auth_type === "string"
        ? { auth_type: body.auth_type }
        : {}),
      ...(typeof body.data_format === "string"
        ? { data_format: body.data_format }
        : {}),
      ...(Object.hasOwn(body, "thing_model")
        ? { thing_model: body.thing_model }
        : {})
    });

    return NextResponse.json(apiOk(product, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: ProductRouteContext
) {
  const requestId = createRequestId();

  try {
    const { productId } = await params;
    const product = await deleteProduct(prisma, {
      orgId: getOrgId(request),
      productId
    });

    return NextResponse.json(apiOk(product, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

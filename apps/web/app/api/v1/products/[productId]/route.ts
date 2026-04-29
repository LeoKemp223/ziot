import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiOk } from "@/lib/api-response";
import { apiErrorResponse } from "@/lib/api-errors";
import { createRequestId } from "@/lib/request-id";
import {
  deleteProduct,
  getProduct,
  updateProduct
} from "@/lib/products/product-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

type ProductRouteContext = {
  params: Promise<{
    productId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: ProductRouteContext
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
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId
    });

    return NextResponse.json(apiOk(product, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: ProductRouteContext
) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("product:write")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { productId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const product = await updateProduct(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
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
    await safeWriteAuditLog(prisma, {
      user,
      action: "product.update",
      resourceType: "product",
      resourceId: product.id,
      request,
      detail: { name: product.name }
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
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("product:write")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const { productId } = await params;
    const product = await deleteProduct(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "product.delete",
      resourceType: "product",
      resourceId: product.id,
      request,
      detail: { deleted_at: product.deleted_at }
    });

    return NextResponse.json(apiOk(product, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiOk } from "@/lib/api-response";
import { apiErrorResponse } from "@/lib/api-errors";
import { createRequestId } from "@/lib/request-id";
import { createProduct, listProducts } from "@/lib/products/product-service";
import { getCurrentUser } from "@/lib/identity/session";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const { searchParams } = request.nextUrl;

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("product:read")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const products = await listProducts(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("page_size") ?? "20"),
      ...(searchParams.has("keyword")
        ? { keyword: searchParams.get("keyword") ?? "" }
        : {})
    });

    return NextResponse.json(apiOk(products, requestId));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const user = await getCurrentUser(request);

    if (!user.permissions.includes("product:write")) {
      throw Object.assign(new Error("permission denied"), { code: 403001 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const input = {
      orgId: user.current_org_id,
      createdBy: user.id,
      name: String(body.name ?? ""),
      thing_model: body.thing_model
    };
    const product = await createProduct(prisma, {
      ...input,
      ...(typeof body.product_key === "string"
        ? { product_key: body.product_key }
        : {}),
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
        : {})
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "product.create",
      resourceType: "product",
      resourceId: product.id,
      request,
      detail: { name: product.name, product_key: product.product_key }
    });

    return NextResponse.json(apiOk(product, requestId), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

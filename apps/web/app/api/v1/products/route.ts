import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiOk } from "@/lib/api-response";
import { apiErrorResponse } from "@/lib/api-errors";
import { createRequestId } from "@/lib/request-id";
import { createProduct, listProducts } from "@/lib/products/product-service";

export const runtime = "nodejs";

const DEFAULT_ORG_ID = "org_default";

function getOrgId(request: NextRequest): string {
  return request.headers.get("x-org-id")?.trim() || DEFAULT_ORG_ID;
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const { searchParams } = request.nextUrl;

  try {
    const products = await listProducts(prisma, {
      orgId: getOrgId(request),
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
    const body = (await request.json()) as Record<string, unknown>;
    const input = {
      orgId: getOrgId(request),
      product_key: String(body.product_key ?? ""),
      name: String(body.name ?? ""),
      thing_model: body.thing_model
    };
    const product = await createProduct(prisma, {
      ...input,
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

    return NextResponse.json(apiOk(product, requestId), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

import { validateThingModel, type ThingModel } from "@ziot/domain";

export type ProductServiceError = Error & {
  code: 400001 | 409001 | 500001;
};

export type ProductRecord = {
  id: string;
  org_id: string;
  product_key: string;
  name: string;
  protocols: unknown;
  auth_type: string;
  data_format: string;
  thing_model: unknown;
  status: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  _count?: {
    devices?: number;
  };
};

type ProductListDelegate = {
  count(args: unknown): Promise<number>;
  findMany(args: unknown): Promise<ProductRecord[]>;
};

type ProductCreateDelegate = {
  findUnique(args: unknown): Promise<ProductRecord | null>;
  create(args: unknown): Promise<ProductRecord>;
};

export type ProductListDb = {
  product: ProductListDelegate;
};

export type ProductCreateDb = {
  product: ProductCreateDelegate;
};

export type ListProductsInput = {
  orgId: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
};

export type CreateProductInput = {
  orgId: string;
  product_key: string;
  name: string;
  protocols?: string[];
  auth_type?: string;
  data_format?: string;
  thing_model?: unknown;
};

export type ProductDto = {
  id: string;
  product_key: string;
  name: string;
  protocols: string[];
  auth_type: string;
  data_format: string;
  thing_model: ThingModel;
  status: string;
  device_count: number;
  created_at: string;
  updated_at: string;
};

function serviceError(
  code: ProductServiceError["code"],
  message: string
): ProductServiceError {
  return Object.assign(new Error(message), { code });
}

function clampPage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 20;
  }

  return Math.min(100, Math.max(1, Math.floor(value)));
}

function normalizeProtocols(protocols: unknown): string[] {
  if (!Array.isArray(protocols)) {
    return [];
  }

  return protocols.filter((protocol): protocol is string => {
    return typeof protocol === "string" && protocol.length > 0;
  });
}

function defaultThingModel(): ThingModel {
  return {
    version: "1.0",
    properties: [],
    events: [],
    services: []
  };
}

function normalizeThingModel(input: unknown): ThingModel {
  const result = validateThingModel(input ?? defaultThingModel());

  if (!result.success) {
    throw serviceError(400001, result.errors.join("; "));
  }

  return result.data;
}

function mapProduct(product: ProductRecord): ProductDto {
  return {
    id: product.id,
    product_key: product.product_key,
    name: product.name,
    protocols: normalizeProtocols(product.protocols),
    auth_type: product.auth_type,
    data_format: product.data_format,
    thing_model: normalizeThingModel(product.thing_model),
    status: product.status,
    device_count: product._count?.devices ?? 0,
    created_at: product.created_at.toISOString(),
    updated_at: product.updated_at.toISOString()
  };
}

export async function listProducts(db: ProductListDb, input: ListProductsInput) {
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const keyword = input.keyword?.trim();
  const where = {
    org_id: input.orgId,
    deleted_at: null,
    ...(keyword
      ? { name: { contains: keyword, mode: "insensitive" as const } }
      : {})
  };

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { devices: true } } }
    })
  ]);

  return {
    items: products.map(mapProduct),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

export async function createProduct(
  db: ProductCreateDb,
  input: CreateProductInput
) {
  const productKey = input.product_key.trim();
  const name = input.name.trim();

  if (!productKey || !/^[A-Za-z0-9_-]{3,64}$/.test(productKey)) {
    throw serviceError(
      400001,
      "product_key must be 3-64 characters of letters, numbers, underscore or hyphen"
    );
  }

  if (!name || name.length > 128) {
    throw serviceError(400001, "name must be 1-128 characters");
  }

  const existing = await db.product.findUnique({
    where: { product_key: productKey }
  });

  if (existing) {
    throw serviceError(409001, "product_key already exists");
  }

  const product = await db.product.create({
    data: {
      id: `prd_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      org_id: input.orgId,
      product_key: productKey,
      name,
      protocols: input.protocols?.length ? input.protocols : ["mqtt"],
      auth_type: input.auth_type ?? "device_secret",
      data_format: input.data_format ?? "json",
      thing_model: normalizeThingModel(input.thing_model)
    },
    include: { _count: { select: { devices: true } } }
  });

  return mapProduct(product);
}

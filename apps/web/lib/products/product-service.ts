import { validateThingModel, type ThingModel } from "@ziot/domain";

export type ProductServiceError = Error & {
  code: 400001 | 404001 | 409001 | 500001;
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

type ProductMutationDelegate = {
  findFirst(args: unknown): Promise<ProductRecord | null>;
  update(args: unknown): Promise<ProductRecord>;
};

type DeviceCountDelegate = {
  count(args: unknown): Promise<number>;
};

export type ProductListDb = {
  product: ProductListDelegate;
};

export type ProductCreateDb = {
  product: ProductCreateDelegate;
};

export type ProductMutationDb = {
  product: ProductMutationDelegate;
  device?: DeviceCountDelegate;
};

export type ListProductsInput = {
  orgId: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
};

export type CreateProductInput = {
  orgId: string;
  product_key?: string;
  name: string;
  protocols?: string[];
  auth_type?: string;
  data_format?: string;
  thing_model?: unknown;
};

export type UpdateProductInput = {
  orgId: string;
  productId: string;
  name?: string;
  protocols?: string[];
  auth_type?: string;
  data_format?: string;
  thing_model?: unknown;
};

export type DeleteProductInput = {
  orgId: string;
  productId: string;
};

export type ProductThingModelInput = {
  orgId: string;
  productId: string;
  thing_model: unknown;
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

async function findActiveProduct(
  db: ProductMutationDb,
  input: DeleteProductInput
): Promise<ProductRecord> {
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      org_id: input.orgId,
      deleted_at: null
    },
    include: { _count: { select: { devices: true } } }
  });

  if (!product) {
    throw serviceError(404001, "product not found");
  }

  return product;
}

function generatedProductKey(): string {
  return `pk_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  const productKey = input.product_key?.trim() || generatedProductKey();
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

export async function updateProduct(
  db: ProductMutationDb,
  input: UpdateProductInput
) {
  await findActiveProduct(db, input);

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();

    if (!name || name.length > 128) {
      throw serviceError(400001, "name must be 1-128 characters");
    }

    data.name = name;
  }

  if (input.protocols !== undefined) {
    data.protocols = input.protocols.length ? input.protocols : ["mqtt"];
  }

  if (input.auth_type !== undefined) {
    data.auth_type = input.auth_type;
  }

  if (input.data_format !== undefined) {
    data.data_format = input.data_format;
  }

  if (input.thing_model !== undefined) {
    data.thing_model = normalizeThingModel(input.thing_model);
  }

  const product = await db.product.update({
    where: { id: input.productId },
    data,
    include: { _count: { select: { devices: true } } }
  });

  return mapProduct(product);
}

export async function getProduct(
  db: ProductMutationDb,
  input: DeleteProductInput
) {
  return mapProduct(await findActiveProduct(db, input));
}

export async function updateProductThingModel(
  db: ProductMutationDb,
  input: ProductThingModelInput
) {
  await findActiveProduct(db, input);

  const product = await db.product.update({
    where: { id: input.productId },
    data: { thing_model: normalizeThingModel(input.thing_model) },
    include: { _count: { select: { devices: true } } }
  });

  return mapProduct(product).thing_model;
}

export async function deleteProduct(
  db: ProductMutationDb,
  input: DeleteProductInput
) {
  await findActiveProduct(db, input);

  if (db.device) {
    const deviceCount = await db.device.count({
      where: {
        product_id: input.productId,
        deleted_at: null
      }
    });

    if (deviceCount > 0) {
      throw serviceError(409001, "product has active devices");
    }
  }

  const product = await db.product.update({
    where: { id: input.productId },
    data: { deleted_at: new Date() },
    include: { _count: { select: { devices: true } } }
  });

  return {
    id: product.id,
    deleted_at: product.deleted_at?.toISOString() ?? null
  };
}

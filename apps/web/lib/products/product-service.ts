export type ProductServiceError = Error & {
  code: 400001 | 404001 | 409001 | 500001;
};

export type ProductRecord = {
  id: string;
  org_id: string;
  created_by?: string;
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
  count(args: unknown): Promise<number>;
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
  userId?: string;
  canAccessAll?: boolean;
  page?: number;
  pageSize?: number;
  keyword?: string;
};

export type CreateProductInput = {
  orgId: string;
  createdBy: string;
  quotaExempt?: boolean;
  product_key?: string;
  name: string;
  protocols?: string[];
  auth_type?: string;
  data_format?: string;
};

export type UpdateProductInput = {
  orgId: string;
  userId?: string;
  canAccessAll?: boolean;
  productId: string;
  name?: string;
  protocols?: string[];
  auth_type?: string;
  data_format?: string;
};

export type DeleteProductInput = {
  orgId: string;
  userId?: string;
  canAccessAll?: boolean;
  productId: string;
};

export type ProductDto = {
  id: string;
  created_by?: string;
  product_key: string;
  name: string;
  protocols: string[];
  auth_type: string;
  data_format: string;
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

// 产品目前仅支持 MQTT 接入;protocols 字段保留以兼容既有数据结构
const SUPPORTED_PROTOCOLS = ["mqtt"];

// 每用户在每个组织最多可创建的产品数(删除产品即释放名额;组织管理员不受限制)
const MAX_PRODUCTS_PER_USER = 20;

function assertProtocols(protocols: string[] | undefined): string[] {
  if (!protocols?.length) {
    return ["mqtt"];
  }

  for (const protocol of protocols) {
    if (!SUPPORTED_PROTOCOLS.includes(protocol)) {
      throw serviceError(
        400001,
        `不支持的协议 "${protocol}"，当前仅支持 "mqtt"`
      );
    }
  }

  return protocols;
}

function normalizeProtocols(protocols: unknown): string[] {
  if (!Array.isArray(protocols)) {
    return [];
  }

  return protocols.filter((protocol): protocol is string => {
    return typeof protocol === "string" && protocol.length > 0;
  });
}

// thing_model 列为 NOT NULL,写入空默认值占位(功能已下线)
function defaultThingModel() {
  return {
    version: "1.0",
    properties: [],
    events: [],
    services: []
  };
}

function mapProduct(product: ProductRecord): ProductDto {
  return {
    id: product.id,
    ...(product.created_by ? { created_by: product.created_by } : {}),
    product_key: product.product_key,
    name: product.name,
    protocols: normalizeProtocols(product.protocols),
    auth_type: product.auth_type,
    data_format: product.data_format,
    status: product.status,
    device_count: product._count?.devices ?? 0,
    created_at: product.created_at.toISOString(),
    updated_at: product.updated_at.toISOString()
  };
}

function ownerFilter(input: { userId?: string; canAccessAll?: boolean }) {
  return input.canAccessAll || !input.userId ? {} : { created_by: input.userId };
}

async function findActiveProduct(
  db: ProductMutationDb,
  input: DeleteProductInput
): Promise<ProductRecord> {
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: { _count: { select: { devices: { where: { deleted_at: null } } } } }
  });

  if (!product) {
    throw serviceError(404001, "产品不存在");
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
    ...ownerFilter(input),
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
      include: { _count: { select: { devices: { where: { deleted_at: null } } } } }
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
      "product_key 必须为 3-64 位字母、数字、下划线或中划线"
    );
  }

  if (!name || name.length > 128) {
    throw serviceError(400001, "名称长度必须为 1-128 位");
  }

  // 每用户配额:删除产品即释放名额;组织管理员不受限制
  if (!input.quotaExempt) {
    const count = await db.product.count({
      where: {
        org_id: input.orgId,
        created_by: input.createdBy,
        deleted_at: null
      }
    });

    if (count >= MAX_PRODUCTS_PER_USER) {
      throw serviceError(
        409001,
        `产品数量已达上限（每个用户最多 ${MAX_PRODUCTS_PER_USER} 个，可删除旧产品释放名额）`
      );
    }
  }

  const existing = await db.product.findUnique({
    where: { product_key: productKey }
  });

  if (existing) {
    throw serviceError(409001, "product_key 已存在");
  }

  const product = await db.product.create({
    data: {
      id: `prd_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      org_id: input.orgId,
      created_by: input.createdBy,
      product_key: productKey,
      name,
      protocols: assertProtocols(input.protocols),
      auth_type: input.auth_type ?? "device_secret",
      data_format: input.data_format ?? "json",
      thing_model: defaultThingModel()
    },
    include: { _count: { select: { devices: { where: { deleted_at: null } } } } }
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
      throw serviceError(400001, "名称长度必须为 1-128 位");
    }

    data.name = name;
  }

  if (input.protocols !== undefined) {
    data.protocols = assertProtocols(input.protocols);
  }

  if (input.auth_type !== undefined) {
    data.auth_type = input.auth_type;
  }

  if (input.data_format !== undefined) {
    data.data_format = input.data_format;
  }

  const product = await db.product.update({
    where: { id: input.productId },
    data,
    include: { _count: { select: { devices: { where: { deleted_at: null } } } } }
  });

  return mapProduct(product);
}

export async function getProduct(
  db: ProductMutationDb,
  input: DeleteProductInput
) {
  return mapProduct(await findActiveProduct(db, input));
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
      throw serviceError(409001, "产品下仍有设备，无法删除");
    }
  }

  const product = await db.product.update({
    where: { id: input.productId },
    data: { deleted_at: new Date() },
    include: { _count: { select: { devices: { where: { deleted_at: null } } } } }
  });

  return {
    id: product.id,
    deleted_at: product.deleted_at?.toISOString() ?? null
  };
}

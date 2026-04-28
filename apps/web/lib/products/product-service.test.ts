import { describe, expect, it, vi } from "vitest";
import { createProduct, listProducts } from "./product-service";

const now = new Date("2026-04-28T08:00:00.000Z");

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prd_demo",
    org_id: "org_default",
    product_key: "pk_demo",
    name: "演示产品",
    protocols: ["mqtt", "http"],
    auth_type: "device_secret",
    data_format: "json",
    thing_model: {
      version: "1.0",
      properties: [],
      events: [],
      services: []
    },
    status: "active",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    _count: { devices: 2 },
    ...overrides
  };
}

describe("product service", () => {
  it("lists active products scoped to one organization", async () => {
    const db = {
      product: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([product()])
      }
    };

    const result = await listProducts(db, {
      orgId: "org_default",
      page: 1,
      pageSize: 10,
      keyword: "演示"
    });

    expect(db.product.count).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        deleted_at: null,
        name: { contains: "演示", mode: "insensitive" }
      }
    });
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        where: expect.objectContaining({ org_id: "org_default" })
      })
    );
    expect(result.items[0]).toMatchObject({
      id: "prd_demo",
      product_key: "pk_demo",
      name: "演示产品",
      device_count: 2
    });
    expect(result.pagination).toEqual({
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1
    });
  });

  it("creates a product with a validated default thing model", async () => {
    const db = {
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(product({ id: "prd_new" }))
      }
    };

    const result = await createProduct(db, {
      orgId: "org_default",
      product_key: "pk_sensor",
      name: "传感器产品",
      protocols: ["mqtt"],
      auth_type: "device_secret",
      data_format: "json"
    });

    expect(db.product.findUnique).toHaveBeenCalledWith({
      where: { product_key: "pk_sensor" }
    });
    expect(db.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        org_id: "org_default",
        product_key: "pk_sensor",
        name: "传感器产品",
        protocols: ["mqtt"],
        auth_type: "device_secret",
        data_format: "json",
        thing_model: {
          version: "1.0",
          properties: [],
          events: [],
          services: []
        }
      }),
      include: { _count: { select: { devices: true } } }
    });
    expect(result.id).toBe("prd_new");
  });

  it("rejects duplicated product keys", async () => {
    const db = {
      product: {
        findUnique: vi.fn().mockResolvedValue(product()),
        create: vi.fn()
      }
    };

    await expect(
      createProduct(db, {
        orgId: "org_default",
        product_key: "pk_demo",
        name: "重复产品",
        protocols: ["mqtt"],
        auth_type: "device_secret",
        data_format: "json"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "product_key already exists"
    });
  });
});

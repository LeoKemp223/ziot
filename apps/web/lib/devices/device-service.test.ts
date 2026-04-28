import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  addDeviceToGroup,
  createDevice,
  resetDeviceSecret,
  updateDevice,
  updateDeviceDesiredShadow
} from "./device-service";

const now = new Date("2026-04-28T08:00:00.000Z");

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prd_demo",
    org_id: "org_default",
    product_key: "pk_demo",
    name: "演示产品",
    deleted_at: null,
    ...overrides
  };
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: "dev_demo",
    org_id: "org_default",
    product_id: "prd_demo",
    device_key: "dk_demo",
    device_secret_hash: "$2b$10$hash",
    name: "演示设备",
    status: "active",
    online_status: "unknown",
    firmware_version: null,
    tags: {},
    last_heartbeat_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    product: product(),
    ...overrides
  };
}

describe("device service", () => {
  it("creates a device and returns the plain secret only in the response", async () => {
    const createdDevice = device({ id: "dev_new", device_key: "dk_sensor" });
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      device: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdDevice)
      },
      deviceShadow: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const result = await createDevice(db, {
      orgId: "org_default",
      productId: "prd_demo",
      name: "传感器",
      deviceKey: "dk_sensor"
    });
    const createArgs = db.device.create.mock.calls[0]?.[0] as {
      data: { device_secret_hash: string; device_secret?: string };
    };

    expect(result).toMatchObject({
      id: "dev_new",
      device_key: "dk_sensor",
      device_secret: expect.stringMatching(/^ds_/)
    });
    expect(createArgs.data.device_secret).toBeUndefined();
    await expect(
      bcrypt.compare(result.device_secret ?? "", createArgs.data.device_secret_hash)
    ).resolves.toBe(true);
    expect(db.deviceShadow.create).toHaveBeenCalledWith({
      data: {
        device_id: "dev_new",
        org_id: "org_default",
        reported: {},
        desired: {}
      }
    });
  });

  it("rejects duplicated device keys in the same product", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      device: {
        findFirst: vi.fn().mockResolvedValue(device()),
        create: vi.fn()
      }
    };

    await expect(
      createDevice(db, {
        orgId: "org_default",
        productId: "prd_demo",
        name: "重复设备",
        deviceKey: "dk_demo"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "device_key already exists in product"
    });
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it("updates device status to disabled", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device()),
        update: vi.fn().mockResolvedValue(device({ status: "disabled" }))
      }
    };

    const result = await updateDevice(db, {
      orgId: "org_default",
      deviceId: "dev_demo",
      status: "disabled"
    });

    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "dev_demo" },
      data: { status: "disabled" },
      include: { product: true }
    });
    expect(result.status).toBe("disabled");
  });

  it("resets a device secret and returns the new secret once", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device()),
        update: vi.fn().mockImplementation(async ({ data }) =>
          device({
            device_secret_hash: data.device_secret_hash
          })
        )
      }
    };

    const result = await resetDeviceSecret(db, {
      orgId: "org_default",
      deviceId: "dev_demo"
    });
    const updateArgs = db.device.update.mock.calls[0]?.[0] as {
      data: { device_secret_hash: string; device_secret?: string };
    };

    expect(result.device_secret).toMatch(/^ds_/);
    expect(updateArgs.data.device_secret).toBeUndefined();
    await expect(
      bcrypt.compare(result.device_secret ?? "", updateArgs.data.device_secret_hash)
    ).resolves.toBe(true);
  });

  it("adds a device to a same-product group", async () => {
    const db = {
      deviceGroup: {
        findFirst: vi.fn().mockResolvedValue({
          id: "dgp_demo",
          org_id: "org_default",
          product_id: "prd_demo",
          deleted_at: null
        })
      },
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceGroupMember: {
        upsert: vi.fn().mockResolvedValue({})
      }
    };

    const result = await addDeviceToGroup(db, {
      orgId: "org_default",
      groupId: "dgp_demo",
      deviceId: "dev_demo"
    });

    expect(result).toEqual({ group_id: "dgp_demo", device_id: "dev_demo" });
    expect(db.deviceGroupMember.upsert).toHaveBeenCalledWith({
      where: {
        group_id_device_id: {
          group_id: "dgp_demo",
          device_id: "dev_demo"
        }
      },
      update: {},
      create: {
        group_id: "dgp_demo",
        device_id: "dev_demo"
      }
    });
  });

  it("rejects adding a device to a group from another product", async () => {
    const db = {
      deviceGroup: {
        findFirst: vi.fn().mockResolvedValue({
          id: "dgp_other",
          org_id: "org_default",
          product_id: "prd_other",
          deleted_at: null
        })
      },
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceGroupMember: {
        upsert: vi.fn()
      }
    };

    await expect(
      addDeviceToGroup(db, {
        orgId: "org_default",
        groupId: "dgp_other",
        deviceId: "dev_demo"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "device and group must belong to the same product"
    });
    expect(db.deviceGroupMember.upsert).not.toHaveBeenCalled();
  });

  it("updates desired shadow state and increments the version", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceShadow: {
        update: vi.fn().mockResolvedValue({
          device_id: "dev_demo",
          reported: { temperature: 21 },
          desired: { power: true },
          version: BigInt(2),
          updated_at: now
        })
      }
    };

    const result = await updateDeviceDesiredShadow(db, {
      orgId: "org_default",
      deviceId: "dev_demo",
      desired: { power: true }
    });

    expect(db.deviceShadow.update).toHaveBeenCalledWith({
      where: { device_id: "dev_demo" },
      data: {
        desired: { power: true },
        version: { increment: 1 }
      }
    });
    expect(result).toMatchObject({
      desired: { power: true },
      version: 2
    });
  });
});

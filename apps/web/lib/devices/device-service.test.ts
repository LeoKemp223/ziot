import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  addDeviceToGroup,
  createDevice,
  getDevice,
  listDeviceRecords,
  listDeviceReports,
  listDeviceTopics,
  listDevices,
  resetDeviceSecret,
  updateDevice,
  updateDeviceDesiredShadow
} from "./device-service";

const now = new Date("2026-04-28T08:00:00.000Z");

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prd_demo",
    org_id: "org_default",
    created_by: "usr_admin",
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
    created_by: "usr_admin",
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
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdDevice)
      },
      deviceShadow: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const result = await createDevice(db, {
      orgId: "org_default",
      createdBy: "usr_member",
      userId: "usr_member",
      canAccessAll: false,
      productId: "prd_demo",
      name: "传感器",
      deviceKey: "dk_sensor"
    });
    const createArgs = db.device.create.mock.calls[0]?.[0] as {
      data: {
        created_by: string;
        device_secret_hash: string;
        device_secret?: string;
      };
    };

    expect(result).toMatchObject({
      id: "dev_new",
      device_key: "dk_sensor",
      device_secret: expect.stringMatching(/^[a-f0-9]{48}$/)
    });
    expect(createArgs.data.device_secret).toBeUndefined();
    expect(createArgs.data.created_by).toBe("usr_member");
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
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(device()),
        create: vi.fn()
      }
    };

    await expect(
      createDevice(db, {
        orgId: "org_default",
        createdBy: "usr_admin",
        productId: "prd_demo",
        name: "重复设备",
        deviceKey: "dk_demo"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "device_key 在该产品下已存在"
    });
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it("rejects device creation beyond the per-product quota", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      device: {
        count: vi.fn().mockResolvedValue(50),
        findFirst: vi.fn(),
        create: vi.fn()
      },
      deviceShadow: {
        create: vi.fn()
      }
    };

    await expect(
      createDevice(db, {
        orgId: "org_default",
        createdBy: "usr_member",
        productId: "prd_demo",
        name: "超限设备"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "设备数量已达上限（每个产品最多 50 个，可删除旧设备释放名额）"
    });
    expect(db.device.findFirst).not.toHaveBeenCalled();
    expect(db.device.create).not.toHaveBeenCalled();
    expect(db.deviceShadow.create).not.toHaveBeenCalled();
  });

  it("counts only active devices in the product toward the quota", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      device: {
        count: vi.fn().mockResolvedValue(49),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(device({ id: "dev_new" }))
      },
      deviceShadow: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    await createDevice(db, {
      orgId: "org_default",
      createdBy: "usr_member",
      productId: "prd_demo",
      name: "第 50 个设备"
    });

    expect(db.device.count).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        product_id: "prd_demo",
        deleted_at: null
      }
    });
    expect(db.device.create).toHaveBeenCalled();
  });

  it("enforces the device quota for organization admins as well", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      device: {
        count: vi.fn().mockResolvedValue(50),
        findFirst: vi.fn(),
        create: vi.fn()
      },
      deviceShadow: {
        create: vi.fn()
      }
    };

    await expect(
      createDevice(db, {
        orgId: "org_default",
        createdBy: "usr_admin",
        userId: "usr_admin",
        canAccessAll: true,
        productId: "prd_demo",
        name: "管理员设备"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "设备数量已达上限（每个产品最多 50 个，可删除旧设备释放名额）"
    });
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it("rejects creating a device under another creator's product", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      device: {
        findFirst: vi.fn(),
        create: vi.fn()
      }
    };

    await expect(
      createDevice(db, {
        orgId: "org_default",
        createdBy: "usr_member",
        userId: "usr_member",
        canAccessAll: false,
        productId: "prd_other",
        name: "无权设备"
      })
    ).rejects.toMatchObject({
      code: 404001,
      message: "产品不存在"
    });
    expect(db.product.findFirst).toHaveBeenCalledWith({
      where: {
        id: "prd_other",
        org_id: "org_default",
        deleted_at: null,
        created_by: "usr_member"
      }
    });
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it("scopes device lists to the creator when access is not organization-wide", async () => {
    const db = {
      device: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([device({ created_by: "usr_member" })])
      }
    };

    await listDevices(db, {
      orgId: "org_default",
      userId: "usr_member",
      canAccessAll: false
    });

    expect(db.device.count).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        deleted_at: null,
        created_by: "usr_member"
      }
    });
    expect(db.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        where: {
          org_id: "org_default",
          deleted_at: null,
          created_by: "usr_member"
        }
      })
    );
  });

  it("rejects reading another creator's device", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };

    await expect(
      getDevice(db, {
        orgId: "org_default",
        userId: "usr_member",
        canAccessAll: false,
        deviceId: "dev_other"
      })
    ).rejects.toMatchObject({
      code: 404001,
      message: "设备不存在"
    });
    expect(db.device.findFirst).toHaveBeenCalledWith({
      where: {
        id: "dev_other",
        org_id: "org_default",
        deleted_at: null,
        created_by: "usr_member"
      },
      include: { product: true }
    });
  });

  it("lists built-in MQTT topics for a scoped device", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      }
    };

    const result = await listDeviceTopics(db, {
      orgId: "org_default",
      userId: "usr_member",
      canAccessAll: false,
      deviceId: "dev_demo"
    });

    expect(db.device.findFirst).toHaveBeenCalledWith({
      where: {
        id: "dev_demo",
        org_id: "org_default",
        deleted_at: null,
        created_by: "usr_member"
      },
      include: { product: true }
    });
    expect(result).toEqual([
      expect.objectContaining({
        key: "property-post",
        operation: "publish",
        topic: "/sys/pk_demo/dk_demo/thing/property/post"
      }),
      expect.objectContaining({
        key: "property-set",
        operation: "subscribe",
        topic: "/sys/pk_demo/dk_demo/thing/property/set"
      }),
      expect.objectContaining({
        key: "event-post",
        operation: "publish",
        topic: "/sys/pk_demo/dk_demo/thing/event/post"
      }),
      expect.objectContaining({
        key: "log-post",
        operation: "publish",
        topic: "/sys/pk_demo/dk_demo/thing/log/post"
      }),
      expect.objectContaining({
        key: "service-invoke",
        operation: "subscribe",
        topic: "/sys/pk_demo/dk_demo/thing/service/+/invoke"
      }),
      expect.objectContaining({
        key: "service-reply",
        operation: "publish",
        topic: "/sys/pk_demo/dk_demo/thing/service/{identifier}/reply"
      })
    ]);
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

    expect(result.device_secret).toMatch(/^[a-f0-9]{48}$/);
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
      message: "设备和分组必须属于同一产品"
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

  it("lists recent device reports after checking device scope", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device({ created_by: "usr_member" }))
      },
      deviceLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "dlg_property",
            device_id: "dev_demo",
            type: "property",
            level: "info",
            content: {
              topic: "/sys/pk_demo/dk_demo/thing/property/post",
              payload: { params: { temperature: 23.5 } }
            },
            occurred_at: now,
            created_at: now
          }
        ])
      }
    };

    const result = await listDeviceReports(db, {
      orgId: "org_default",
      userId: "usr_member",
      canAccessAll: false,
      deviceId: "dev_demo"
    });

    expect(db.device.findFirst).toHaveBeenCalledWith({
      where: {
        id: "dev_demo",
        org_id: "org_default",
        deleted_at: null,
        created_by: "usr_member"
      },
      include: { product: true }
    });
    expect(db.deviceLog.findMany).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        device_id: "dev_demo",
        type: { in: ["property", "event", "log"] }
      },
      orderBy: { occurred_at: "desc" },
      take: 20
    });
    expect(result).toEqual([
      {
        id: "dlg_property",
        device_id: "dev_demo",
        type: "property",
        level: "info",
        content: {
          topic: "/sys/pk_demo/dk_demo/thing/property/post",
          payload: { params: { temperature: 23.5 } }
        },
        occurred_at: now.toISOString(),
        created_at: now.toISOString()
      }
    ]);
  });

  it("merges commands and reports into time-desc device records", async () => {
    const commandFixture = (id: string, createdAt: Date) => ({
      id,
      org_id: "org_default",
      device_id: "dev_demo",
      identifier: "setSwitch",
      params: { power: true },
      status: "success",
      request_id: id,
      result: null,
      error_code: null,
      error_message: null,
      timeout_at: createdAt,
      sent_at: createdAt,
      replied_at: null,
      created_at: createdAt,
      updated_at: createdAt
    });
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device({ created_by: "usr_member" }))
      },
      deviceCommand: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([
          commandFixture("cmd_a", new Date("2026-04-28T08:00:03.000Z")),
          commandFixture("cmd_c", new Date("2026-04-28T08:00:01.000Z"))
        ])
      },
      deviceLog: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "dlg_b",
            device_id: "dev_demo",
            type: "property",
            level: "info",
            content: { payload: { params: { temperature: 23.5 } } },
            occurred_at: new Date("2026-04-28T08:00:02.000Z"),
            created_at: new Date("2026-04-28T08:00:02.000Z")
          }
        ])
      }
    };

    const result = await listDeviceRecords(db, {
      orgId: "org_default",
      userId: "usr_member",
      canAccessAll: false,
      deviceId: "dev_demo"
    });

    expect(db.device.findFirst).toHaveBeenCalledWith({
      where: {
        id: "dev_demo",
        org_id: "org_default",
        deleted_at: null,
        created_by: "usr_member"
      },
      include: { product: true }
    });
    expect(db.deviceCommand.findMany).toHaveBeenCalledWith({
      where: { org_id: "org_default", device_id: "dev_demo" },
      orderBy: { created_at: "desc" },
      take: 20
    });
    expect(db.deviceLog.findMany).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        device_id: "dev_demo",
        type: { in: ["property", "event", "log"] }
      },
      orderBy: { occurred_at: "desc" },
      take: 20
    });
    expect(result.items.map((item) => item.id)).toEqual([
      "cmd_a",
      "dlg_b",
      "cmd_c"
    ]);
    expect(result.items.map((item) => item.source)).toEqual([
      "command",
      "report",
      "command"
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      page_size: 20,
      total: 3,
      total_pages: 1
    });
  });

  it("slices merged device records by page", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceCommand: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "cmd_a",
            identifier: "setSwitch",
            params: {},
            status: "success",
            request_id: "cmd_a",
            result: null,
            error_message: null,
            created_at: new Date("2026-04-28T08:00:03.000Z")
          },
          {
            id: "cmd_c",
            identifier: "property.set",
            params: { humidity: 45 },
            status: "success",
            request_id: "cmd_c",
            result: null,
            error_message: null,
            created_at: new Date("2026-04-28T08:00:01.000Z")
          }
        ])
      },
      deviceLog: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "dlg_b",
            type: "property",
            level: "info",
            content: {},
            occurred_at: new Date("2026-04-28T08:00:02.000Z")
          }
        ])
      }
    };

    const result = await listDeviceRecords(db, {
      orgId: "org_default",
      canAccessAll: true,
      deviceId: "dev_demo",
      page: 2,
      pageSize: 2
    });

    expect(db.deviceCommand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 4 })
    );
    expect(result.items.map((item) => item.id)).toEqual(["cmd_c"]);
    expect(result.pagination).toEqual({
      page: 2,
      page_size: 2,
      total: 3,
      total_pages: 2
    });
  });

  it("caps the per-source fetch window for deep pages", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceCommand: {
        count: vi.fn().mockResolvedValue(2500),
        findMany: vi.fn().mockResolvedValue([])
      },
      deviceLog: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const result = await listDeviceRecords(db, {
      orgId: "org_default",
      canAccessAll: true,
      deviceId: "dev_demo",
      page: 200,
      pageSize: 10
    });

    expect(db.deviceCommand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 })
    );
    expect(db.deviceLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 })
    );
    expect(result.items).toEqual([]);
    expect(result.pagination).toEqual({
      page: 200,
      page_size: 10,
      total: 2500,
      total_pages: 250
    });
  });

  it("rejects merged device records for another creator's device", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };

    await expect(
      listDeviceRecords(db, {
        orgId: "org_default",
        userId: "usr_member",
        canAccessAll: false,
        deviceId: "dev_other"
      })
    ).rejects.toMatchObject({ code: 404001 });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGroupCommands,
  createDeviceCommand,
  createSyncDeviceCommand,
  getCommand,
  listDeviceCommands,
  recordCommandReply
} from "./control-service";

const now = new Date("2026-04-29T08:00:00.000Z");

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prd_demo",
    product_key: "pk_demo",
    ...overrides
  };
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: "dev_demo",
    org_id: "org_default",
    created_by: "usr_admin",
    device_key: "dk_demo",
    status: "active",
    product: product(),
    ...overrides
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmd_demo",
    org_id: "org_default",
    device_id: "dev_demo",
    device: device({ name: "演示设备" }),
    identifier: "setSwitch",
    params: { power: true },
    status: "sent",
    request_id: "cmd_demo",
    result: null,
    error_code: null,
    error_message: null,
    timeout_at: now,
    sent_at: now,
    replied_at: null,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function mockEmqxFetch() {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "token_demo" })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "publish_demo" })
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("control service", () => {
  it("creates a service command and publishes it through emqx", async () => {
    const fetchMock = mockEmqxFetch();
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceCommand: {
        create: vi.fn().mockResolvedValue(command({ status: "pending" })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(command())
      },
      deviceShadow: {
        update: vi.fn()
      }
    };

    const result = await createDeviceCommand(db, {
      orgId: "org_default",
      userId: "usr_admin",
      canAccessAll: true,
      deviceId: "dev_demo",
      kind: "service",
      identifier: "setSwitch",
      params: { power: true }
    });

    expect(result).toMatchObject({
      identifier: "setSwitch",
      status: "sent"
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:18083/api/v5/publish",
      expect.objectContaining({
        body: expect.stringContaining(
          "/sys/pk_demo/dk_demo/thing/service/setSwitch/invoke"
        )
      })
    );
    expect(db.deviceShadow.update).not.toHaveBeenCalled();
  });

  it("updates desired shadow when sending a property set command", async () => {
    mockEmqxFetch();
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceCommand: {
        create: vi.fn().mockResolvedValue(
          command({ identifier: "property.set", status: "pending" })
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue(command({ identifier: "property.set" }))
      },
      deviceShadow: {
        update: vi.fn().mockResolvedValue({})
      }
    };

    await createDeviceCommand(db, {
      orgId: "org_default",
      userId: "usr_admin",
      canAccessAll: true,
      deviceId: "dev_demo",
      kind: "property_set",
      params: { power: true }
    });

    expect(db.deviceShadow.update).toHaveBeenCalledWith({
      where: { device_id: "dev_demo" },
      data: {
        desired: { power: true },
        version: { increment: 1 }
      }
    });
  });

  it("records a successful service reply", async () => {
    const db = {
      deviceCommand: {
        findUnique: vi.fn().mockResolvedValue(command()),
        update: vi.fn().mockResolvedValue(
          command({
            status: "success",
            result: { ok: true },
            replied_at: now
          })
        )
      }
    };

    const result = await recordCommandReply(db, {
      topic: "/sys/pk_demo/dk_demo/thing/service/setSwitch/reply",
      payload: {
        id: "cmd_demo",
        code: 0,
        data: { ok: true }
      }
    });

    expect(db.deviceCommand.update).toHaveBeenCalledWith({
      where: { request_id: "cmd_demo" },
      data: expect.objectContaining({
        status: "success",
        result: { ok: true }
      }),
      include: { device: { include: { product: true } } }
    });
    expect(result.status).toBe("success");
  });

  it("records base64 encoded service replies from emqx rules", async () => {
    const db = {
      deviceCommand: {
        findUnique: vi.fn().mockResolvedValue(command()),
        update: vi.fn().mockResolvedValue(
          command({
            status: "success",
            result: { ok: true },
            replied_at: now
          })
        )
      }
    };

    await recordCommandReply(db, {
      topic: "/sys/pk_demo/dk_demo/thing/service/setSwitch/reply",
      payload: Buffer.from(
        JSON.stringify({
          id: "cmd_demo",
          code: 0,
          data: { ok: true }
        })
      ).toString("base64")
    });

    expect(db.deviceCommand.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "success",
          result: { ok: true }
        })
      })
    );
  });

  it("expires stale commands before listing or reading", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceCommand: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([command({ status: "timeout" })]),
        findFirst: vi.fn().mockResolvedValue(command({ status: "timeout" }))
      }
    };

    await listDeviceCommands(db, {
      orgId: "org_default",
      deviceId: "dev_demo",
      canAccessAll: true
    });
    await getCommand(db, {
      orgId: "org_default",
      commandId: "cmd_demo",
      canAccessAll: true
    });

    expect(db.deviceCommand.updateMany).toHaveBeenCalledTimes(2);
  });

  it("rejects disabled devices before publishing", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device({ status: "disabled" }))
      }
    };

    await expect(
      createDeviceCommand(db, {
        orgId: "org_default",
        userId: "usr_admin",
        canAccessAll: true,
        deviceId: "dev_demo",
        kind: "service",
        identifier: "setSwitch",
        params: {}
      })
    ).rejects.toMatchObject({
      code: 403001,
      message: "device is disabled"
    });
  });

  it("returns an existing terminal result for duplicate replies", async () => {
    const db = {
      deviceCommand: {
        findUnique: vi.fn().mockResolvedValue(command({ status: "success" })),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue(command({ status: "success", result: { ok: true } })),
        update: vi.fn()
      }
    };

    const result = await recordCommandReply(db, {
      topic: "/sys/pk_demo/dk_demo/thing/service/setSwitch/reply",
      payload: {
        id: "cmd_demo",
        code: 0,
        data: { ok: true }
      }
    });

    expect(result.status).toBe("success");
    expect(db.deviceCommand.update).not.toHaveBeenCalled();
  });

  it("waits for sync command success", async () => {
    vi.stubEnv("REDIS_URL", "");
    mockEmqxFetch();
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceCommand: {
        create: vi.fn().mockResolvedValue(command({ status: "pending" })),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(command({ status: "sent" })),
        findFirst: vi.fn().mockResolvedValue(command({ status: "success" }))
      },
      deviceShadow: {
        update: vi.fn()
      }
    };

    const result = await createSyncDeviceCommand(db, {
      orgId: "org_default",
      userId: "usr_admin",
      canAccessAll: true,
      deviceId: "dev_demo",
      kind: "service",
      identifier: "setSwitch",
      params: {},
      timeoutMs: 1000
    });

    expect(result.status).toBe("success");
  });

  it("returns timeout status for sync command timeout", async () => {
    vi.stubEnv("REDIS_URL", "");
    mockEmqxFetch();
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      },
      deviceCommand: {
        create: vi.fn().mockResolvedValue(command({ status: "pending" })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(command({ status: "sent" })),
        findFirst: vi.fn().mockResolvedValue(command({ status: "timeout" }))
      },
      deviceShadow: {
        update: vi.fn()
      }
    };

    const result = await createSyncDeviceCommand(db, {
      orgId: "org_default",
      userId: "usr_admin",
      canAccessAll: true,
      deviceId: "dev_demo",
      kind: "service",
      identifier: "setSwitch",
      params: {},
      timeoutMs: 1000
    });

    expect(result.status).toBe("timeout");
  });

  it("creates batch commands for a same-product group", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ token: "token_demo" })
      });
    vi.stubGlobal("fetch", fetchMock);
    const db = {
      deviceGroup: {
        findFirst: vi.fn().mockResolvedValue({
          id: "grp_demo",
          org_id: "org_default",
          product_id: "prd_demo",
          product: {
            id: "prd_demo",
            product_key: "pk_demo",
            thing_model: {
              services: [{ identifier: "setSwitch" }]
            }
          },
          members: [
            { device: device({ id: "dev_1" }) },
            { device: device({ id: "dev_2" }) }
          ]
        })
      },
      device: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(device({ id: "dev_1" }))
          .mockResolvedValueOnce(device({ id: "dev_2" }))
      },
      deviceCommand: {
        create: vi
          .fn()
          .mockResolvedValueOnce(command({ id: "cmd_1", device_id: "dev_1" }))
          .mockResolvedValueOnce(command({ id: "cmd_2", device_id: "dev_2" })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce(command({ id: "cmd_1", device_id: "dev_1" }))
          .mockResolvedValueOnce(command({ id: "cmd_2", device_id: "dev_2" }))
      },
      deviceShadow: {
        update: vi.fn()
      }
    };

    const result = await createGroupCommands(db, {
      orgId: "org_default",
      userId: "usr_admin",
      canAccessAll: true,
      groupId: "grp_demo",
      kind: "service",
      identifier: "setSwitch",
      params: {}
    });

    expect(result.total).toBe(2);
    expect(db.deviceCommand.create).toHaveBeenCalledTimes(2);
  });
});

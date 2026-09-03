import { describe, expect, it, vi } from "vitest";
import {
  bindDeviceByCode,
  getDeviceBindingCode,
  getActiveBinding,
  renameAppDeviceAlias,
  rotateDeviceBindingCode,
  unbindAppDevice,
} from "./binding-service";

const now = new Date("2026-09-03T08:00:00.000Z");
const PERMANENT_CODE = "BDABCDEFGHJKLMNPQR"; // BD + 16 位合法字符

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: "dev_demo",
    org_id: "org_default",
    created_by: "usr_admin",
    device_key: "dk_demo",
    binding_code: null,
    binding_code_generated_at: null,
    status: "active",
    deleted_at: null,
    product: { id: "prd_demo", product_key: "pk_demo", name: "演示产品" },
    shadow: {
      reported: { temperature: 24.5 },
      desired: {},
      version: 3n,
      updated_at: now,
    },
    ...overrides,
  };
}

function binding(overrides: Record<string, unknown> = {}) {
  return {
    id: "bnd_demo",
    app_user_id: "app_user1",
    device_id: "dev_demo",
    alias: null,
    status: "active",
    bound_at: now,
    unbound_at: null,
    created_at: now,
    updated_at: now,
    device: device(),
    ...overrides,
  };
}

describe("binding service (permanent code)", () => {
  it("lazily generates a permanent code on first view and keeps it stable", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device()),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const first = await getDeviceBindingCode(db, {
      orgId: "org_default",
      userId: "usr_admin",
      deviceId: "dev_demo",
    });

    expect(first.code).toMatch(/^BD[2-9A-HJ-NP-Z]{16}$/);
    expect(first.qr_data_url).toMatch(/^data:image\/png;base64,/);
    expect(first.qr_content).toMatch(/\/b\/#BD[2-9A-HJ-NP-Z]{16}$/);
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "dev_demo" },
      data: {
        binding_code: first.code,
        binding_code_generated_at: expect.any(Date),
      },
    });

    // 再次查看返回同一个码(明文持久化,可反复补打标签)
    const db2 = {
      device: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            device({
              binding_code: first.code,
              binding_code_generated_at: now,
            })
          ),
        update: vi.fn(),
      },
    };
    const second = await getDeviceBindingCode(db2, {
      orgId: "org_default",
      userId: "usr_admin",
      deviceId: "dev_demo",
    });
    expect(second.code).toBe(first.code);
    expect(db2.device.update).not.toHaveBeenCalled();
  });

  it("rotates the permanent code (old one invalidated)", async () => {
    const db = {
      device: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            device({ binding_code: PERMANENT_CODE, binding_code_generated_at: now })
          ),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const rotated = await rotateDeviceBindingCode(db, {
      orgId: "org_default",
      userId: "usr_admin",
      deviceId: "dev_demo",
    });

    expect(rotated.code).toMatch(/^BD[2-9A-HJ-NP-Z]{16}$/);
    expect(rotated.code).not.toBe(PERMANENT_CODE);
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "dev_demo" },
      data: {
        binding_code: rotated.code,
        binding_code_generated_at: expect.any(Date),
      },
    });
  });

  it("binds a device with a valid permanent code (no expiry, reusable)", async () => {
    const db = {
      device: {
        findUnique: vi
          .fn()
          .mockResolvedValue(device({ binding_code: PERMANENT_CODE })),
      },
      userDevice: {
        upsert: vi.fn().mockResolvedValue(binding()),
      },
    };

    const result = await bindDeviceByCode(db, {
      appUserId: "app_user1",
      code: PERMANENT_CODE.toLowerCase(),
    });

    // 输入自动转大写;按明文唯一索引直查
    expect(db.device.findUnique).toHaveBeenCalledWith({
      where: { binding_code: PERMANENT_CODE },
      include: { product: true, shadow: true },
    });
    expect(db.userDevice.upsert).toHaveBeenCalledWith({
      where: {
        app_user_id_device_id: {
          app_user_id: "app_user1",
          device_id: "dev_demo",
        },
      },
      update: { status: "active", unbound_at: null },
      create: {
        id: expect.stringMatching(/^bnd_/),
        app_user_id: "app_user1",
        device_id: "dev_demo",
      },
      include: { device: { include: { product: true, shadow: true } } },
    });
    expect(result.device_id).toBe("dev_demo");
    expect(result.shadow_reported).toEqual({ temperature: 24.5 });
  });

  it("rejects malformed codes with 400001", async () => {
    const db = { device: { findUnique: vi.fn() } };

    await expect(
      bindDeviceByCode(db, { appUserId: "app_user1", code: "BD123" })
    ).rejects.toMatchObject({ code: 400001 });
    expect(db.device.findUnique).not.toHaveBeenCalled();
  });

  it("rejects unknown codes with 400001 to prevent enumeration", async () => {
    const db = {
      device: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      bindDeviceByCode(db, { appUserId: "app_user1", code: PERMANENT_CODE })
    ).rejects.toMatchObject({ code: 400001 });
  });

  it("rejects codes of soft-deleted devices", async () => {
    const db = {
      device: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            device({ binding_code: PERMANENT_CODE, deleted_at: now })
          ),
      },
    };

    await expect(
      bindDeviceByCode(db, { appUserId: "app_user1", code: PERMANENT_CODE })
    ).rejects.toMatchObject({ code: 400001 });
  });

  it("rejects codes of disabled devices with 403001", async () => {
    const db = {
      device: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            device({ binding_code: PERMANENT_CODE, status: "disabled" })
          ),
      },
    };

    await expect(
      bindDeviceByCode(db, { appUserId: "app_user1", code: PERMANENT_CODE })
    ).rejects.toMatchObject({ code: 403001 });
  });

  it("rebinds via upsert after unbind", async () => {
    const db = {
      device: {
        findUnique: vi
          .fn()
          .mockResolvedValue(device({ binding_code: PERMANENT_CODE })),
      },
      userDevice: {
        upsert: vi
          .fn()
          .mockResolvedValue(binding({ status: "unbound", unbound_at: now })),
      },
    };

    await bindDeviceByCode(db, {
      appUserId: "app_user1",
      code: PERMANENT_CODE,
    });

    expect(db.userDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { status: "active", unbound_at: null },
      })
    );
  });

  it("requires an active binding to access a device", async () => {
    const db = {
      userDevice: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      getActiveBinding(db, { appUserId: "app_user1", deviceId: "dev_demo" })
    ).rejects.toMatchObject({ code: 403001 });
  });

  it("validates alias length on rename", async () => {
    const db = {
      userDevice: {
        findFirst: vi.fn().mockResolvedValue(binding()),
      },
    };

    await expect(
      renameAppDeviceAlias(db, {
        appUserId: "app_user1",
        deviceId: "dev_demo",
        alias: "x".repeat(129),
      })
    ).rejects.toMatchObject({ code: 400001 });
  });

  it("unbinds and reports the device org for audit", async () => {
    const db = {
      userDevice: {
        findFirst: vi.fn().mockResolvedValue(binding()),
        update: vi.fn().mockResolvedValue(
          binding({ status: "unbound", unbound_at: now })
        ),
      },
    };

    const result = await unbindAppDevice(db, {
      appUserId: "app_user1",
      deviceId: "dev_demo",
    });

    expect(result.device_id).toBe("dev_demo");
    expect(result.org_id).toBe("org_default");
    expect(db.userDevice.update).toHaveBeenCalledWith({
      where: {
        app_user_id_device_id: {
          app_user_id: "app_user1",
          device_id: "dev_demo",
        },
      },
      data: { status: "unbound", unbound_at: expect.any(Date) },
    });
  });
});

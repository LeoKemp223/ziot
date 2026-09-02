import { describe, expect, it, vi } from "vitest";
import {
  createFirmware,
  createOtaTask,
  deleteFirmware,
  deleteOtaTask,
  recordOtaProgress
} from "./ota-service";

const now = new Date("2026-04-29T08:00:00.000Z");

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

function firmware(overrides: Record<string, unknown> = {}) {
  return {
    id: "fw_demo",
    org_id: "org_default",
    product_id: "prd_demo",
    product: product(),
    version: "v1.0.1",
    file_url: "https://example.com/fw.bin",
    file_size: BigInt(1024),
    sha256: "0".repeat(64),
    release_note: "demo",
    status: "released",
    created_by: "usr_admin",
    created_at: now,
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
    name: "演示设备",
    deleted_at: null,
    product: product(),
    ...overrides
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "ota_demo",
    org_id: "org_default",
    product_id: "prd_demo",
    product: product(),
    firmware_id: "fw_demo",
    firmware: firmware(),
    name: "升级任务",
    strategy: { target_type: "all" },
    status: "created",
    scheduled_at: null,
    started_at: null,
    finished_at: null,
    created_by: "usr_admin",
    created_at: now,
    records: [],
    ...overrides
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "otr_demo",
    org_id: "org_default",
    task_id: "ota_demo",
    device_id: "dev_demo",
    device: device(),
    status: "notified",
    progress: 0,
    error_message: null,
    started_at: now,
    finished_at: null,
    updated_at: now,
    task: task(),
    ...overrides
  };
}

describe("ota service", () => {
  it("creates firmware and rejects invalid sha256", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      firmware: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(firmware({ status: "draft" }))
      }
    };

    const result = await createFirmware(db, {
      orgId: "org_default",
      createdBy: "usr_admin",
      productId: "prd_demo",
      version: "v1.0.1",
      fileUrl: "https://example.com/fw.bin",
      fileSize: 1024,
      sha256: "0".repeat(64)
    });

    expect(result).toMatchObject({ version: "v1.0.1", file_size: 1024 });
    expect(db.firmware.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          file_size: BigInt(1024),
          sha256: "0".repeat(64)
        })
      })
    );

    await expect(
      createFirmware(db, {
        orgId: "org_default",
        createdBy: "usr_admin",
        productId: "prd_demo",
        version: "v1.0.2",
        fileUrl: "https://example.com/fw.bin",
        fileSize: 1024,
        sha256: "bad"
      })
    ).rejects.toMatchObject({ code: 400001 });
  });

  it("rejects firmware creation beyond the per-user quota", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      firmware: {
        count: vi.fn().mockResolvedValue(10),
        findFirst: vi.fn(),
        create: vi.fn()
      }
    };

    await expect(
      createFirmware(db, {
        orgId: "org_default",
        createdBy: "usr_admin",
        productId: "prd_demo",
        version: "v1.1.0",
        fileUrl: "https://example.com/fw.bin",
        fileSize: 1024,
        sha256: "0".repeat(64)
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "固件数量已达上限（每个用户最多 10 个，可删除旧固件释放名额）"
    });
    expect(db.firmware.create).not.toHaveBeenCalled();
  });

  it("counts only the user's own firmwares in the org toward the quota", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      firmware: {
        count: vi.fn().mockResolvedValue(9),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(firmware({ version: "v1.1.0" }))
      }
    };

    const result = await createFirmware(db, {
      orgId: "org_default",
      createdBy: "usr_admin",
      productId: "prd_demo",
      version: "v1.1.0",
      fileUrl: "https://example.com/fw.bin",
      fileSize: 1024,
      sha256: "0".repeat(64)
    });

    expect(db.firmware.count).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        created_by: "usr_admin"
      }
    });
    expect(result.version).toBe("v1.1.0");
  });

  it("deletes an unreferenced firmware and skips external file urls", async () => {
    const db = {
      firmware: {
        findFirst: vi.fn().mockResolvedValue(firmware()),
        delete: vi.fn().mockResolvedValue(firmware())
      },
      otaTask: {
        count: vi.fn().mockResolvedValue(0)
      }
    };

    const result = await deleteFirmware(db, {
      orgId: "org_default",
      userId: "usr_admin",
      firmwareId: "fw_demo"
    });

    expect(db.otaTask.count).toHaveBeenCalledWith({
      where: { firmware_id: "fw_demo" }
    });
    expect(db.firmware.delete).toHaveBeenCalledWith({
      where: { id: "fw_demo" }
    });
    expect(result).toEqual({ id: "fw_demo", deleted: true });
  });

  it("rejects deleting a firmware referenced by OTA tasks", async () => {
    const db = {
      firmware: {
        findFirst: vi.fn().mockResolvedValue(firmware()),
        delete: vi.fn()
      },
      otaTask: {
        count: vi.fn().mockResolvedValue(2)
      }
    };

    await expect(
      deleteFirmware(db, {
        orgId: "org_default",
        userId: "usr_admin",
        firmwareId: "fw_demo"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "固件已被升级任务引用，请先删除相关任务"
    });
    expect(db.firmware.delete).not.toHaveBeenCalled();
  });

  it("deletes a finished OTA task with its records", async () => {
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(task({ status: "finished" })),
        delete: vi.fn().mockResolvedValue(task({ status: "finished" }))
      }
    };

    const result = await deleteOtaTask(db, {
      orgId: "org_default",
      userId: "usr_admin",
      taskId: "ota_demo"
    });

    expect(db.otaTask.delete).toHaveBeenCalledWith({
      where: { id: "ota_demo" }
    });
    expect(result).toEqual({ id: "ota_demo", deleted: true });
  });

  it("rejects deleting an unfinished OTA task", async () => {
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(task({ status: "running" })),
        delete: vi.fn()
      }
    };

    await expect(
      deleteOtaTask(db, {
        orgId: "org_default",
        userId: "usr_admin",
        taskId: "ota_demo"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "升级任务未结束，请先取消后再删除"
    });
    expect(db.otaTask.delete).not.toHaveBeenCalled();
  });

  it("creates an OTA task for all scoped product devices", async () => {
    const db = {
      firmware: {
        findFirst: vi.fn().mockResolvedValue(firmware())
      },
      device: {
        findMany: vi.fn().mockResolvedValue([device()])
      },
      otaTask: {
        create: vi.fn().mockResolvedValue(
          task({
            records: [record()]
          })
        )
      }
    };

    const result = await createOtaTask(db, {
      orgId: "org_default",
      createdBy: "usr_admin",
      firmwareId: "fw_demo",
      name: "升级任务",
      strategy: { target_type: "all" }
    });

    expect(result.record_counts.total).toBe(1);
    expect(db.device.findMany).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        product_id: "prd_demo",
        deleted_at: null
      },
      include: { product: true }
    });
    expect(db.otaTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          records: {
            create: [
              expect.objectContaining({
                org_id: "org_default",
                device_id: "dev_demo"
              })
            ]
          }
        })
      })
    );
  });

  it("records OTA success and updates device firmware version", async () => {
    const db = {
      otaRecord: {
        findFirst: vi.fn().mockResolvedValue(record()),
        update: vi.fn().mockResolvedValue(
          record({
            status: "success",
            progress: 100,
            finished_at: now
          })
        ),
        count: vi.fn().mockResolvedValue(0)
      },
      device: {
        update: vi.fn().mockResolvedValue({})
      },
      otaTask: {
        update: vi.fn().mockResolvedValue({})
      }
    };

    const result = await recordOtaProgress(db, {
      orgId: "org_default",
      deviceId: "dev_demo",
      taskId: "ota_demo",
      status: "success",
      firmwareVersion: "v1.0.1"
    });

    expect(result.status).toBe("success");
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "dev_demo" },
      data: { firmware_version: "v1.0.1" }
    });
    expect(db.otaTask.update).toHaveBeenCalledWith({
      where: { id: "ota_demo" },
      data: {
        status: "finished",
        finished_at: expect.any(Date)
      }
    });
  });
});

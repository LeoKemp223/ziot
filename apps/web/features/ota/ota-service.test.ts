import { describe, expect, it, vi } from "vitest";
import {
  createDeltaFirmware,
  createFirmware,
  createOtaTask,
  deleteFirmware,
  deleteOtaTask,
  recordOtaProgress,
  startOtaTask
} from "./ota-service";

// 固件对象存储:仅 mock 接口边界,公共直链走假 URL,删除对象用 spy
const storageMocks = vi.hoisted(() => ({
  firmwarePublicUrl: vi.fn((fileUrl: string) =>
    fileUrl.startsWith("minio://")
      ? `https://public.example.com/${fileUrl.slice("minio://".length)}`
      : null
  ),
  removeFirmwareObject: vi.fn(async () => undefined)
}));

vi.mock("./firmware-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./firmware-storage")>();
  return {
    ...actual,
    firmwarePublicUrl: storageMocks.firmwarePublicUrl,
    removeFirmwareObject: storageMocks.removeFirmwareObject
  };
});

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
    base_version: null,
    target_sha256: null,
    patch_format: null,
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

  it("decorates minio-stored firmware with a presigned download url", async () => {
    const minioUrl = "minio://ziot-firmwares/firmwares/pk_demo/abc-fw.bin";
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      firmware: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(firmware({ file_url: minioUrl }))
      }
    };

    const result = await createFirmware(db, {
      orgId: "org_default",
      createdBy: "usr_admin",
      productId: "prd_demo",
      version: "v1.0.1",
      fileUrl: minioUrl,
      fileSize: 1024,
      sha256: "0".repeat(64)
    });

    expect(result.download_url).toBe(
      "https://public.example.com/ziot-firmwares/firmwares/pk_demo/abc-fw.bin"
    );

    // 外部 URL 不签名,download_url 为 null
    db.firmware.create.mockResolvedValue(firmware({ file_url: "https://example.com/fw.bin" }));
    const external = await createFirmware(db, {
      orgId: "org_default",
      createdBy: "usr_admin",
      productId: "prd_demo",
      version: "v1.0.1",
      fileUrl: "https://example.com/fw.bin",
      fileSize: 1024,
      sha256: "0".repeat(64)
    });
    expect(external.download_url).toBeNull();
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

  it("removes the minio object when deleting a minio-stored firmware", async () => {
    storageMocks.removeFirmwareObject.mockClear();
    const db = {
      firmware: {
        findFirst: vi.fn().mockResolvedValue(
          firmware({ file_url: "minio://ziot-firmwares/firmwares/pk_demo/abc-fw.bin" })
        ),
        delete: vi.fn().mockResolvedValue(firmware())
      },
      otaTask: {
        count: vi.fn().mockResolvedValue(0)
      }
    };

    await deleteFirmware(db, {
      orgId: "org_default",
      userId: "usr_admin",
      firmwareId: "fw_demo"
    });

    expect(storageMocks.removeFirmwareObject).toHaveBeenCalledWith(
      "firmwares/pk_demo/abc-fw.bin"
    );
    expect(db.firmware.delete).toHaveBeenCalledWith({ where: { id: "fw_demo" } });
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

  it("scopes the full firmware duplicate check to base_version null", async () => {
    const db = {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      firmware: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(firmware())
      }
    };

    await createFirmware(db, {
      orgId: "org_default",
      createdBy: "usr_admin",
      productId: "prd_demo",
      version: "v1.0.1",
      fileUrl: "https://example.com/fw.bin",
      fileSize: 1024,
      sha256: "0".repeat(64)
    });

    expect(db.firmware.findFirst).toHaveBeenCalledWith({
      where: {
        product_id: "prd_demo",
        version: "v1.0.1",
        base_version: null
      }
    });
  });
});

describe("ota service delta firmware", () => {
  // 拦截 EMQX REST 调用:login 放行,publish 解出 MQTT payload(publishMqtt 二次 stringify 过)
  function collectPublishBodies() {
    const bodies: { task_id: string; firmware: Record<string, unknown> }[] = [];
    const fetchMock = vi.fn(async (url: unknown, init: { body: string }) => {
      if (String(url).endsWith("/api/v5/login")) {
        return { ok: true, json: async () => ({ token: "token" }) };
      }

      const published = JSON.parse(init.body) as { payload: string };

      bodies.push(JSON.parse(published.payload));

      return { ok: true };
    });

    return { bodies, fetchMock };
  }

  // 只关心发给了谁:捕获 publish 的 topic
  function collectPublishTopics() {
    const topics: string[] = [];
    const fetchMock = vi.fn(async (url: unknown, init: { body: string }) => {
      if (String(url).endsWith("/api/v5/login")) {
        return { ok: true, json: async () => ({ token: "token" }) };
      }

      const published = JSON.parse(init.body) as { topic: string };

      topics.push(published.topic);

      return { ok: true };
    });

    return { topics, fetchMock };
  }

  function deltaDb(
    options: {
      count?: number;
      existing?: unknown;
    } = {}
  ) {
    return {
      product: {
        findFirst: vi.fn().mockResolvedValue(product())
      },
      firmware: {
        count: vi.fn().mockResolvedValue(options.count ?? 0),
        findFirst: vi.fn().mockResolvedValue(options.existing ?? null),
        create: vi.fn().mockResolvedValue(
          firmware({
            version: "v1.0.2",
            base_version: "v1.0.1",
            target_sha256: "1".repeat(64),
            patch_format: "bsdiff-heatshrink"
          })
        )
      }
    };
  }

  const deltaInput = {
    orgId: "org_default",
    createdBy: "usr_admin",
    productId: "prd_demo",
    version: "v1.0.2",
    baseVersion: "v1.0.1",
    fileUrl: "https://example.com/v1.0.1-to-v1.0.2.patch",
    fileSize: 2048,
    sha256: "0".repeat(64),
    targetSha256: "1".repeat(64)
  };

  it("creates a delta firmware with base version and target sha256", async () => {
    const db = deltaDb();

    const result = await createDeltaFirmware(db, deltaInput);

    expect(db.firmware.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: "v1.0.2",
          base_version: "v1.0.1",
          target_sha256: "1".repeat(64),
          patch_format: "bsdiff-heatshrink",
          file_size: BigInt(2048),
          sha256: "0".repeat(64),
          status: "released"
        })
      })
    );
    expect(result).toMatchObject({
      version: "v1.0.2",
      base_version: "v1.0.1",
      target_sha256: "1".repeat(64),
      patch_format: "bsdiff-heatshrink"
    });
  });

  it("rejects a delta whose target version equals its base version", async () => {
    const db = deltaDb();

    await expect(
      createDeltaFirmware(db, { ...deltaInput, version: "v1.0.1" })
    ).rejects.toMatchObject({
      code: 400001,
      message: "差分固件的目标版本不能与基线版本相同"
    });
    expect(db.firmware.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate delta for the same base and target version", async () => {
    const db = deltaDb({
      existing: firmware({ base_version: "v1.0.1" })
    });

    await expect(createDeltaFirmware(db, deltaInput)).rejects.toMatchObject({
      code: 409001,
      message: "该基线版本下已存在相同目标版本的差分固件"
    });
    expect(db.firmware.create).not.toHaveBeenCalled();
  });

  it("rejects delta creation beyond the per-user quota", async () => {
    const db = deltaDb({ count: 10 });

    await expect(createDeltaFirmware(db, deltaInput)).rejects.toMatchObject({
      code: 409001,
      message: "固件数量已达上限（每个用户最多 10 个，可删除旧固件释放名额）"
    });
    expect(db.firmware.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid target sha256", async () => {
    const db = deltaDb();

    await expect(
      createDeltaFirmware(db, { ...deltaInput, targetSha256: "bad" })
    ).rejects.toMatchObject({ code: 400001 });
    expect(db.firmware.create).not.toHaveBeenCalled();
  });

  it("publishes delta fields in the OTA notify payload", async () => {
    const runningTask = task({
      status: "running",
      firmware: firmware({
        version: "v1.0.2",
        base_version: "v1.0.1",
        target_sha256: "1".repeat(64),
        patch_format: "bsdiff-heatshrink",
        file_url: "https://example.com/v1.0.1-to-v1.0.2.patch"
      }),
      records: [record({ status: "created" })]
    });
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(task({ status: "created" })),
        update: vi.fn().mockResolvedValue(runningTask)
      },
      otaRecord: {
        updateMany: vi.fn().mockResolvedValue({})
      }
    };
    const publishBodies = collectPublishBodies();

    vi.stubGlobal("fetch", publishBodies.fetchMock);

    await startOtaTask(db, {
      orgId: "org_default",
      userId: "usr_admin",
      taskId: "ota_demo"
    });

    expect(publishBodies.bodies).toHaveLength(1);
    const published = publishBodies.bodies[0] as {
      task_id: string;
      firmware: Record<string, unknown>;
    };
    expect(published.firmware).toMatchObject({
      version: "v1.0.2",
      // 遗留/外部 URL 原样下发
      file_url: "https://example.com/v1.0.1-to-v1.0.2.patch",
      package_type: "delta",
      base_version: "v1.0.1",
      target_sha256: "1".repeat(64),
      patch_format: "bsdiff-heatshrink"
    });

    vi.unstubAllGlobals();
  });

  it("omits delta fields for full packages in the notify payload", async () => {
    const runningTask = task({
      status: "running",
      records: [record({ status: "created" })]
    });
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(task({ status: "created" })),
        update: vi.fn().mockResolvedValue(runningTask)
      },
      otaRecord: {
        updateMany: vi.fn().mockResolvedValue({})
      }
    };
    const publishBodies = collectPublishBodies();

    vi.stubGlobal("fetch", publishBodies.fetchMock);

    await startOtaTask(db, {
      orgId: "org_default",
      userId: "usr_admin",
      taskId: "ota_demo"
    });

    const published = publishBodies.bodies[0] as {
      task_id: string;
      firmware: Record<string, unknown>;
    };
    expect(published.firmware).not.toHaveProperty("package_type");
    expect(published.firmware).not.toHaveProperty("base_version");

    vi.unstubAllGlobals();
  });

  it("sends a presigned download url for minio-stored firmware in the notify payload", async () => {
    const runningTask = task({
      status: "running",
      firmware: firmware({
        file_url: "minio://ziot-firmwares/firmwares/pk_demo/abc-fw.bin"
      }),
      records: [record({ status: "created" })]
    });
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(task({ status: "created" })),
        update: vi.fn().mockResolvedValue(runningTask)
      },
      otaRecord: {
        updateMany: vi.fn().mockResolvedValue({})
      }
    };
    const publishBodies = collectPublishBodies();

    vi.stubGlobal("fetch", publishBodies.fetchMock);

    await startOtaTask(db, {
      orgId: "org_default",
      userId: "usr_admin",
      taskId: "ota_demo"
    });

    const published = publishBodies.bodies[0] as {
      task_id: string;
      firmware: Record<string, unknown>;
    };
    expect(published.firmware.file_url).toBe(
      "https://public.example.com/ziot-firmwares/firmwares/pk_demo/abc-fw.bin"
    );

    vi.unstubAllGlobals();
  });

  it("restarts a cancelled task by resetting non-success records and republishing only to them", async () => {
    const cancelledTask = task({
      status: "cancelled",
      records: [
        record({ status: "success", device: device({ device_key: "dk_a" }) }),
        record({
          status: "failed",
          error_message: "download error",
          device: device({ device_key: "dk_b" })
        }),
        record({ status: "cancelled", device: device({ device_key: "dk_c" }) })
      ]
    });
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(cancelledTask),
        update: vi.fn().mockResolvedValue(task({ ...cancelledTask, status: "running" }))
      },
      otaRecord: {
        updateMany: vi.fn().mockResolvedValue({})
      }
    };
    const publishTopics = collectPublishTopics();

    vi.stubGlobal("fetch", publishTopics.fetchMock);

    await startOtaTask(db, {
      orgId: "org_default",
      userId: "usr_admin",
      taskId: "ota_demo"
    });

    expect(db.otaTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: "running",
          started_at: expect.any(Date),
          finished_at: null
        }
      })
    );
    expect(db.otaRecord.updateMany).toHaveBeenCalledWith({
      where: { task_id: "ota_demo", status: { notIn: ["success"] } },
      data: {
        status: "notified",
        progress: 0,
        started_at: expect.any(Date),
        error_message: null,
        finished_at: null
      }
    });
    // 已成功的 dk_a 不重发,仅重置的 dk_b/dk_c 收到通知
    expect(publishTopics.topics).toEqual([
      "/ota/pk_demo/dk_b/upgrade/notify",
      "/ota/pk_demo/dk_c/upgrade/notify"
    ]);

    vi.unstubAllGlobals();
  });

  it("rejects restarting a task whose records are all successful", async () => {
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(
          task({
            status: "finished",
            records: [
              record({ status: "success", device: device({ device_key: "dk_a" }) }),
              record({ status: "success", device: device({ device_key: "dk_b" }) })
            ]
          })
        ),
        update: vi.fn()
      },
      otaRecord: {
        updateMany: vi.fn()
      }
    };
    const publishTopics = collectPublishTopics();

    vi.stubGlobal("fetch", publishTopics.fetchMock);

    await expect(
      startOtaTask(db, {
        orgId: "org_default",
        userId: "usr_admin",
        taskId: "ota_demo"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "所有设备均已升级成功，无需重新启动；如需重新下发请新建任务"
    });
    expect(db.otaTask.update).not.toHaveBeenCalled();
    expect(db.otaRecord.updateMany).not.toHaveBeenCalled();
    expect(publishTopics.topics).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("still rejects starting a running task", async () => {
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(task({ status: "running" })),
        update: vi.fn()
      },
      otaRecord: {
        updateMany: vi.fn()
      }
    };

    await expect(
      startOtaTask(db, {
        orgId: "org_default",
        userId: "usr_admin",
        taskId: "ota_demo"
      })
    ).rejects.toMatchObject({
      code: 409001,
      message: "升级任务当前无法启动"
    });
    expect(db.otaTask.update).not.toHaveBeenCalled();
    expect(db.otaRecord.updateMany).not.toHaveBeenCalled();
  });

  it("keeps initial start scoped to created and scheduled records only", async () => {
    const createdTask = task({
      status: "created",
      records: [
        record({ status: "created", device: device({ device_key: "dk_a" }) }),
        record({ status: "scheduled", device: device({ device_key: "dk_b" }) }),
        record({ status: "success", device: device({ device_key: "dk_c" }) })
      ]
    });
    const db = {
      otaTask: {
        findFirst: vi.fn().mockResolvedValue(createdTask),
        update: vi.fn().mockResolvedValue(task({ ...createdTask, status: "running" }))
      },
      otaRecord: {
        updateMany: vi.fn().mockResolvedValue({})
      }
    };
    const publishTopics = collectPublishTopics();

    vi.stubGlobal("fetch", publishTopics.fetchMock);

    await startOtaTask(db, {
      orgId: "org_default",
      userId: "usr_admin",
      taskId: "ota_demo"
    });

    expect(db.otaRecord.updateMany).toHaveBeenCalledWith({
      where: { task_id: "ota_demo", status: { in: ["created", "scheduled"] } },
      data: {
        status: "notified",
        progress: 0,
        started_at: expect.any(Date),
        error_message: null,
        finished_at: null
      }
    });
    expect(publishTopics.topics).toEqual([
      "/ota/pk_demo/dk_a/upgrade/notify",
      "/ota/pk_demo/dk_b/upgrade/notify"
    ]);

    vi.unstubAllGlobals();
  });
});

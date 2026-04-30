import { describe, expect, it, vi } from "vitest";
import { listCommandLogs, listDeviceLogs, listOtaLogs } from "./log-query-service";

const now = new Date("2026-04-30T01:00:00.000Z");

describe("operation log query service", () => {
  it("lists device logs with keyword filtering", async () => {
    const db = {
      deviceLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "dlg_1",
            org_id: "org_default",
            product_id: "prd_demo",
            product: { name: "产品", product_key: "pk_demo" },
            device_id: "dev_demo",
            device: { name: "设备", device_key: "dk_demo" },
            type: "property",
            level: "info",
            content: { payload: { params: { temperature: 24 } } },
            occurred_at: now,
            created_at: now
          },
          {
            id: "dlg_2",
            org_id: "org_default",
            product_id: "prd_demo",
            product: { name: "产品", product_key: "pk_demo" },
            device_id: "dev_demo",
            device: { name: "设备", device_key: "dk_demo" },
            type: "event",
            level: "info",
            content: { payload: { event: "boot" } },
            occurred_at: now,
            created_at: now
          }
        ])
      }
    };

    const result = await listDeviceLogs(db, {
      orgId: "org_default",
      canAccessAll: true,
      keyword: "temperature"
    });

    expect(result.pagination.total).toBe(1);
    expect(result.items[0]?.id).toBe("dlg_1");
  });

  it("lists command logs with status filters", async () => {
    const db = {
      deviceCommand: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "cmd_1",
            org_id: "org_default",
            device_id: "dev_demo",
            device: {
              product_id: "prd_demo",
              name: "设备",
              device_key: "dk_demo",
              product: { name: "产品", product_key: "pk_demo" }
            },
            identifier: "setSwitch",
            params: {},
            status: "success",
            request_id: "cmd_1",
            result: {},
            error_code: null,
            error_message: null,
            timeout_at: now,
            sent_at: now,
            replied_at: now,
            created_at: now
          }
        ])
      }
    };

    const result = await listCommandLogs(db, {
      orgId: "org_default",
      canAccessAll: true,
      status: "success"
    });

    expect(db.deviceCommand.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "success" })
    });
    expect(result.items[0]?.status).toBe("success");
  });

  it("lists ota records with task filters", async () => {
    const db = {
      otaRecord: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "otr_1",
            org_id: "org_default",
            task_id: "ota_1",
            task: {
              name: "升级",
              product_id: "prd_demo",
              firmware: { version: "1.0.0" }
            },
            device_id: "dev_demo",
            device: {
              product_id: "prd_demo",
              name: "设备",
              device_key: "dk_demo",
              product: { name: "产品", product_key: "pk_demo" }
            },
            status: "success",
            progress: 100,
            error_message: null,
            started_at: now,
            finished_at: now,
            updated_at: now
          }
        ])
      }
    };

    const result = await listOtaLogs(db, {
      orgId: "org_default",
      canAccessAll: true,
      taskId: "ota_1"
    });

    expect(db.otaRecord.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ task_id: "ota_1" })
    });
    expect(result.items[0]?.firmware_version).toBe("1.0.0");
  });
});

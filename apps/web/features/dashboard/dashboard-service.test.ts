import { describe, expect, it, vi } from "vitest";
import { getDashboardSummary } from "./dashboard-service";

const now = new Date("2026-04-30T10:30:00.000Z");

describe("dashboard service", () => {
  it("builds dashboard summary scoped to the current creator", async () => {
    const db = {
      device: {
        count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1)
      },
      deviceLog: {
        count: vi.fn().mockResolvedValue(8),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "log_error",
              type: "log",
              level: "error",
              product: { name: "演示产品" },
              device: { name: "演示设备" },
              device_id: "dev_demo",
              content: { message: "failed" },
              occurred_at: now
            }
          ])
          .mockResolvedValueOnce([{ occurred_at: now }])
      },
      deviceCommand: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([{ created_at: now }])
      },
      otaTask: {
        count: vi.fn().mockResolvedValue(1)
      }
    };

    const summary = await getDashboardSummary(db, {
      orgId: "org_default",
      userId: "usr_member",
      canAccessAll: false,
      now
    });

    expect(db.device.count).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        deleted_at: null,
        created_by: "usr_member"
      }
    });
    expect(db.otaTask.count).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        status: "running",
        product: {
          deleted_at: null,
          created_by: "usr_member"
        }
      }
    });
    expect(summary).toMatchObject({
      total_devices: 2,
      online_devices: 1,
      online_rate: 50,
      today_reports: 8,
      today_commands: 3,
      running_ota_tasks: 1
    });
    expect(summary.recent_errors[0]).toMatchObject({
      id: "log_error",
      product_name: "演示产品",
      device_name: "演示设备"
    });
    expect(summary.traffic).toHaveLength(12);
  });
});

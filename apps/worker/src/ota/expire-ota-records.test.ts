import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@ziot/db";
import { expireStaleOtaRecords } from "./expire-ota-records";

vi.mock("@ziot/db", () => ({
  prisma: {
    otaRecord: {
      findMany: vi.fn(),
      updateMany: vi.fn()
    },
    otaTask: {
      updateMany: vi.fn()
    }
  }
}));

const PENDING = ["created", "scheduled", "notified", "downloading", "installing"];

function mockStaleTasks(taskIds: string[]) {
  vi.mocked(prisma.otaRecord.findMany).mockResolvedValue(
    taskIds.map((task_id) => ({ task_id })) as never
  );
  vi.mocked(prisma.otaRecord.updateMany).mockResolvedValue({
    count: taskIds.length
  } as never);
  vi.mocked(prisma.otaTask.updateMany).mockResolvedValue({
    count: taskIds.length
  } as never);
}

describe("expire stale ota records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expires pending records and converges affected running tasks", async () => {
    mockStaleTasks(["ota_a", "ota_b"]);

    const result = await expireStaleOtaRecords();

    expect(result).toEqual({ records: 2, tasks: 2 });
    expect(prisma.otaRecord.updateMany).toHaveBeenCalledWith({
      where: {
        task_id: { in: ["ota_a", "ota_b"] },
        status: { in: PENDING },
        updated_at: { lt: expect.any(Date) }
      },
      data: {
        status: "failed",
        error_message: "升级超时：设备长时间未上报进度",
        finished_at: expect.any(Date)
      }
    });
    expect(prisma.otaTask.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["ota_a", "ota_b"] },
        status: "running",
        records: { none: { status: { in: PENDING } } }
      },
      data: { status: "finished", finished_at: expect.any(Date) }
    });
  });

  it("writes nothing when no stale records exist", async () => {
    mockStaleTasks([]);

    const result = await expireStaleOtaRecords();

    expect(result).toEqual({ records: 0, tasks: 0 });
    expect(prisma.otaRecord.updateMany).not.toHaveBeenCalled();
    expect(prisma.otaTask.updateMany).not.toHaveBeenCalled();
  });

  it("honors OTA_RECORD_TIMEOUT_HOURS for the cutoff", async () => {
    process.env.OTA_RECORD_TIMEOUT_HOURS = "2";
    const before = Date.now();
    mockStaleTasks(["ota_a"]);

    await expireStaleOtaRecords();

    const args = vi.mocked(prisma.otaRecord.findMany).mock.calls[0]![0] as unknown as {
      where: { updated_at: { lt: Date } };
    };
    const cutoff = args.where.updated_at.lt;
    // 2 小时阈值,容忍执行耗时误差
    expect(cutoff.getTime()).toBeGreaterThan(before - 2 * 3600 * 1000 - 1000);
    expect(cutoff.getTime()).toBeLessThan(before - 2 * 3600 * 1000 + 1000);

    delete process.env.OTA_RECORD_TIMEOUT_HOURS;
  });
});

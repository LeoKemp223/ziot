import { prisma } from "@ziot/db";

// 非终态记录:设备上报会推进其状态;终态为 success/failed/cancelled
const PENDING_OTA_RECORD_STATUSES = [
  "created",
  "scheduled",
  "notified",
  "downloading",
  "installing"
] as const;

const hourMs = 60 * 60 * 1000;

function timeoutHours() {
  const value = Number(process.env.OTA_RECORD_TIMEOUT_HOURS ?? "24");

  return Number.isFinite(value) && value > 0 ? value : 24;
}

// 超时未上报的记录翻 failed,受影响的 running 任务收敛 finished。
// web 侧 finishTaskIfComplete 只在设备上报时触发,设备失联的任务永远等不到——由本扫描兜底。
export async function expireStaleOtaRecords() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - timeoutHours() * hourMs);

  // 先圈定受影响任务,后续写操作都限定在这些任务内,避免波及刚启动/重启中的任务
  const stale = await prisma.otaRecord.findMany({
    where: {
      status: { in: [...PENDING_OTA_RECORD_STATUSES] },
      updated_at: { lt: cutoff }
    },
    select: { task_id: true },
    distinct: ["task_id"]
  });

  if (stale.length === 0) {
    return { records: 0, tasks: 0 };
  }

  const taskIds = stale.map((record) => record.task_id);

  const expired = await prisma.otaRecord.updateMany({
    where: {
      task_id: { in: taskIds },
      status: { in: [...PENDING_OTA_RECORD_STATUSES] },
      updated_at: { lt: cutoff }
    },
    data: {
      status: "failed",
      error_message: "升级超时：设备长时间未上报进度",
      finished_at: now
    }
  });

  // records:none 保证与 web 侧 finishTaskIfComplete 同一收敛条件;
  // 若此间任务被重启(记录已重置为 notified),none 条件不成立,不会被误收敛
  const finished = await prisma.otaTask.updateMany({
    where: {
      id: { in: taskIds },
      status: "running",
      records: { none: { status: { in: [...PENDING_OTA_RECORD_STATUSES] } } }
    },
    data: {
      status: "finished",
      finished_at: now
    }
  });

  return { records: expired.count, tasks: finished.count };
}

export function startOtaRecordExpiry() {
  const intervalMs = Number(process.env.OTA_RECORD_EXPIRY_INTERVAL_MS ?? "600000");
  const timer = setInterval(() => {
    void expireStaleOtaRecords().catch((error) => {
      console.error("ota record expiry failed", error);
    });
  }, intervalMs);

  // 启动即扫一次,尽快收敛积压的僵尸任务
  void expireStaleOtaRecords().catch((error) => {
    console.error("ota record expiry failed", error);
  });

  return timer;
}

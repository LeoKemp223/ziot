import { prisma } from "@ziot/db";

const dayMs = 24 * 60 * 60 * 1000;

function retentionDays(name: string, fallback: number, max?: number) {
  const value = Number(process.env[name] ?? fallback);
  const normalized = Number.isFinite(value) && value > 0 ? value : fallback;

  return max ? Math.min(normalized, max) : normalized;
}

function cutoff(days: number) {
  return new Date(Date.now() - days * dayMs);
}

export async function runRetentionCleanup() {
  const [deviceLogs, commands, otaRecords, auditLogs] = await Promise.all([
    prisma.deviceLog.deleteMany({
      where: {
        occurred_at: {
          lt: cutoff(retentionDays("DEVICE_LOG_RETENTION_DAYS", 7, 15))
        }
      }
    }),
    prisma.deviceCommand.deleteMany({
      where: {
        created_at: {
          lt: cutoff(retentionDays("COMMAND_RETENTION_DAYS", 7))
        }
      }
    }),
    prisma.otaRecord.deleteMany({
      where: {
        updated_at: {
          lt: cutoff(retentionDays("OTA_RECORD_RETENTION_DAYS", 7))
        }
      }
    }),
    prisma.auditLog.deleteMany({
      where: {
        created_at: {
          lt: cutoff(retentionDays("AUDIT_LOG_RETENTION_DAYS", 7))
        }
      }
    })
  ]);

  return {
    device_logs: deviceLogs.count,
    commands: commands.count,
    ota_records: otaRecords.count,
    audit_logs: auditLogs.count
  };
}

export function startRetentionCleanup() {
  const intervalMs = Number(process.env.RETENTION_CLEANUP_INTERVAL_MS ?? "3600000");
  const timer = setInterval(() => {
    void runRetentionCleanup().catch((error) => {
      console.error("retention cleanup failed", error);
    });
  }, intervalMs);

  void runRetentionCleanup().catch((error) => {
    console.error("retention cleanup failed", error);
  });

  return timer;
}

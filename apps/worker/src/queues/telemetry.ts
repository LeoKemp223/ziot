import { QueueEvents, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { prisma } from "@ziot/db";
import { processTelemetryReport } from "../telemetry/consume-device-reports";

export const telemetryQueueName = "ziot.telemetry";
export const telemetryReportJobName = "telemetry.report";

export type TelemetryReportJob = {
  topic: string;
  payload: unknown;
  received_at: string;
};

function connection() {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null
  });
}

export function startTelemetryWorker() {
  const worker = new Worker<TelemetryReportJob>(
    telemetryQueueName,
    async (job: Job<TelemetryReportJob>) => {
      if (job.name !== telemetryReportJobName) {
        return;
      }

      await processTelemetryReport(prisma, job.data);
    },
    {
      connection: connection(),
      concurrency: Number(process.env.TELEMETRY_WORKER_CONCURRENCY ?? "4")
    }
  );
  const events = new QueueEvents(telemetryQueueName, {
    connection: connection()
  });

  worker.on("failed", (job, error) => {
    console.error("telemetry job failed", job?.id, error);
  });
  events.on("failed", ({ jobId, failedReason }) => {
    console.error("telemetry queue failed", jobId, failedReason);
  });

  return { worker, events };
}

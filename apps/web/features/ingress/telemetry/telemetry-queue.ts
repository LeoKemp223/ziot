import { Queue } from "bullmq";
import Redis from "ioredis";

export const telemetryQueueName = "ziot.telemetry";
export const telemetryReportJobName = "telemetry.report";
const maxTelemetryPayloadBytes = Number(
  process.env.TELEMETRY_MAX_PAYLOAD_BYTES ?? "65536"
);

export type TelemetryReportJob = {
  topic: string;
  payload: unknown;
  received_at: string;
};

let redis: Redis | null = null;
let queue: Queue<TelemetryReportJob> | null = null;

function payloadBytes(payload: unknown) {
  return Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
}

export function assertTelemetryPayloadSize(payload: unknown) {
  if (payloadBytes(payload) > maxTelemetryPayloadBytes) {
    throw Object.assign(new Error("上报数据超出大小限制"), { code: 400001 });
  }
}

function getQueue() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  redis ??= new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false
  });
  queue ??= new Queue<TelemetryReportJob>(telemetryQueueName, {
    connection: redis
  });

  return queue;
}

export async function enqueueTelemetryReport(input: {
  topic: string;
  payload: unknown;
}) {
  assertTelemetryPayloadSize(input.payload);
  const telemetryQueue = getQueue();

  if (!telemetryQueue) {
    return false;
  }

  await telemetryQueue.add(
    telemetryReportJobName,
    {
      topic: input.topic,
      payload: input.payload,
      received_at: new Date().toISOString()
    },
    {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000
      },
      removeOnComplete: 1000,
      removeOnFail: 5000
    }
  );

  return true;
}

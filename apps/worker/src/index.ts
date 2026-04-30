import { startTelemetryWorker } from "./queues/telemetry";
import { startRetentionCleanup } from "./retention/cleanup";
import { startCommandExpiry } from "./control/expire-commands";

const service = "ziot-worker";
const telemetry = startTelemetryWorker();
const retentionTimer = startRetentionCleanup();
const commandExpiryTimer = startCommandExpiry();

console.log(`${service} ready`);

async function shutdown() {
  clearInterval(retentionTimer);
  clearInterval(commandExpiryTimer);
  await telemetry.worker.close();
  await telemetry.events.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

import { spawnSync } from "node:child_process";

// 固件上传/下载链路依赖本地 MinIO(.env.local 指向 localhost:9000)。
// 与 detools 同属环境前提,不可用时跳过而不是报错。
export const minioAvailable =
  spawnSync("curl", ["-sf", "http://localhost:9000/minio/health/live"]).status === 0;

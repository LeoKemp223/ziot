import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";

const MINIO_STORAGE_SCHEME = "minio://";

type StorageError = Error & { code: 500001 };

function storageError(message: string): StorageError {
  const code: StorageError["code"] = 500001;
  return Object.assign(new Error(message), { code });
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw storageError(`MinIO 对象存储未配置（缺少 ${name}）`);
  }

  return value;
}

type MinioEndpointConfig = {
  endPoint: string;
  port: number;
  useSSL: boolean;
};

function endpointConfig(prefix: "MINIO" | "MINIO_INTERNAL"): MinioEndpointConfig {
  // 内网端点各字段缺省回落公共端点配置
  const endPoint = process.env[`${prefix}_ENDPOINT`] ?? requiredEnv("MINIO_ENDPOINT");
  const useSSL =
    (process.env[`${prefix}_USE_SSL`] ?? process.env.MINIO_USE_SSL ?? "false") === "true";
  const port = Number(
    process.env[`${prefix}_PORT`] ?? process.env.MINIO_PORT ?? (useSSL ? "443" : "9000")
  );

  return { endPoint, port, useSSL };
}

function createClient(config: MinioEndpointConfig): MinioClient {
  return new MinioClient({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    // 显式 region 让预签名成为纯离线计算(否则 minio-js 每次签名前都会网络查询 bucket region);
    // MinIO 默认接受 us-east-1
    region: process.env.MINIO_REGION || "us-east-1",
    accessKey: requiredEnv("MINIO_ACCESS_KEY"),
    secretKey: requiredEnv("MINIO_SECRET_KEY")
  });
}

// 服务端读写走内网端点(compose 网络内 minio:9000);公共直链/直传预签名用设备浏览器可达的公共端点
let opsClient: MinioClient | null = null;
let signClient: MinioClient | null = null;

function getOpsClient(): MinioClient {
  opsClient ??= createClient(endpointConfig("MINIO_INTERNAL"));
  return opsClient;
}

function getSignClient(): MinioClient {
  signClient ??= createClient(endpointConfig("MINIO"));
  return signClient;
}

function firmwareBucket(): string {
  const bucket = process.env.MINIO_BUCKET ?? process.env.MINIO_FIRMWARE_BUCKET;

  if (!bucket) {
    throw storageError("MinIO 对象存储未配置（缺少 MINIO_BUCKET）");
  }

  return bucket;
}

// 桶匿名只读策略:固件直链不需要签名/有效期,谁拿到链接谁可下载。
// 对象 key 带 UUID 前缀不可枚举;写入仍需 access key。按用户决策接受此权衡。
function anonymousDownloadPolicy(bucket: string) {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`]
      }
    ]
  });
}

// 惰性建桶并应用匿名只读策略(幂等,成功后缓存;失败重置以便重试),顺带兜底 dev 环境没有 minio-init 的情况
let ensureBucketPromise: Promise<void> | null = null;

export async function ensureFirmwareBucket(): Promise<void> {
  ensureBucketPromise ??= (async () => {
    const client = getOpsClient();
    const bucket = firmwareBucket();

    if (!(await client.bucketExists(bucket))) {
      await client.makeBucket(bucket, "");
    }
    // setBucketPolicy 幂等,每次启动确保策略在位(包括已存在的存量桶)
    await client.setBucketPolicy(bucket, anonymousDownloadPolicy(bucket));
  })().catch((error) => {
    ensureBucketPromise = null;
    throw storageError(`固件存储桶不可用: ${error instanceof Error ? error.message : error}`);
  });

  return ensureBucketPromise;
}

export async function putFirmwareObject(
  objectKey: string,
  bytes: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  await ensureFirmwareBucket();
  await getOpsClient().putObject(firmwareBucket(), objectKey, bytes, bytes.length, {
    "Content-Type": contentType
  });
}

// 尽力而为:与遗留本地文件删除一致,存储端失败不阻塞固件记录删除
export async function removeFirmwareObject(objectKey: string): Promise<void> {
  await getOpsClient().removeObject(firmwareBucket(), objectKey);
}

function safePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return sanitized || fallback;
}

export function firmwareObjectKey(productKey: string, fileName: string): string {
  return `firmwares/${safePathSegment(productKey, "unknown-product")}/${randomUUID()}-${safePathSegment(
    pathBaseName(fileName),
    "firmware.bin"
  )}`;
}

export function deltaPatchObjectKey(
  productKey: string,
  baseVersion: string,
  targetVersion: string
): string {
  return `firmwares/${safePathSegment(productKey, "unknown-product")}/${randomUUID()}-delta-${safePathSegment(
    baseVersion,
    "base"
  )}-${safePathSegment(targetVersion, "target")}.patch`;
}

function pathBaseName(value: string) {
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] || "firmware.bin";
}

export function minioStorageUrl(objectKey: string): string {
  return `${MINIO_STORAGE_SCHEME}${firmwareBucket()}/${objectKey}`;
}

export function isMinioStorageUrl(fileUrl: string): boolean {
  return fileUrl.startsWith(MINIO_STORAGE_SCHEME);
}

export function parseMinioStorageUrl(
  fileUrl: string
): { bucket: string; objectKey: string } | null {
  if (!isMinioStorageUrl(fileUrl)) {
    return null;
  }

  const rest = fileUrl.slice(MINIO_STORAGE_SCHEME.length);
  const separator = rest.indexOf("/");

  if (separator <= 0 || separator === rest.length - 1) {
    return null;
  }

  return { bucket: rest.slice(0, separator), objectKey: rest.slice(separator + 1) };
}

// 永久公共直链(匿名只读桶,path-style):桶在 URL 首段,经 nginx /ziot-firmwares/ 反代或本地直连均可。
// 非常量 minio:// 的遗留/外部 URL 原样透传(null)
export function firmwarePublicUrl(fileUrl: string): string | null {
  const stored = parseMinioStorageUrl(fileUrl);

  if (!stored) {
    return null;
  }

  const { endPoint, port, useSSL } = endpointConfig("MINIO");
  const scheme = useSSL ? "https" : "http";
  const defaultPort = useSSL ? 443 : 80;
  const host = port === defaultPort ? endPoint : `${endPoint}:${port}`;

  return `${scheme}://${host}/${stored.bucket}/${stored.objectKey}`;
}

// 浏览器直传(POST .../upload-url)仍需签名 PUT,写入不可匿名
export async function presignedPutObjectUrl(
  objectKey: string,
  expirySeconds: number
): Promise<string> {
  return getSignClient().presignedPutObject(firmwareBucket(), objectKey, expirySeconds);
}

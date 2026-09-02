import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Client as MinioClient } from "minio";
import { buildPagination, clampPage, clampPageSize } from "@/lib/pagination";

type Db = { [key: string]: any };
type AccessScope = {
  userId?: string;
  canAccessAll?: boolean;
};

type OtaError = Error & {
  code: 400001 | 403001 | 404001 | 409001 | 500001;
};

type OtaRecordStatus =
  | "created"
  | "scheduled"
  | "notified"
  | "downloading"
  | "installing"
  | "success"
  | "failed"
  | "cancelled";

type TargetStrategy = {
  target_type?: "all" | "devices" | "group";
  device_ids?: string[];
  group_id?: string;
};

// 每用户在每个组织最多保留的固件数(删除固件即释放名额)
const MAX_FIRMWARES_PER_USER = 10;

function otaError(code: OtaError["code"], message: string): OtaError {
  return Object.assign(new Error(message), { code });
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function ownerFilter(input: AccessScope) {
  return input.canAccessAll || !input.userId ? {} : { created_by: input.userId };
}

function assertName(value: string, field = "name") {
  const name = value.trim();

  if (!name || name.length > 128) {
    throw otaError(400001, `${field}长度必须为 1-128 位`);
  }

  return name;
}

function assertSha256(value: string) {
  const sha256 = value.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw otaError(400001, "sha256 必须为 64 位小写十六进制字符");
  }

  return sha256;
}

function normalizeFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw otaError(400001, "固件大小必须大于 0");
  }

  return BigInt(Math.floor(value));
}

function mapFirmware(firmware: any) {
  return {
    id: firmware.id,
    org_id: firmware.org_id,
    product_id: firmware.product_id,
    product_name: firmware.product?.name ?? "",
    product_key: firmware.product?.product_key ?? "",
    version: firmware.version,
    file_url: firmware.file_url,
    file_size: Number(firmware.file_size),
    sha256: firmware.sha256,
    release_note: firmware.release_note,
    status: firmware.status,
    created_by: firmware.created_by,
    created_at: firmware.created_at.toISOString()
  };
}

function mapTask(task: any, counts?: Record<string, number>) {
  const recordCounts =
    counts ??
    (Array.isArray(task.records)
      ? task.records.reduce((acc: Record<string, number>, record: any) => {
          acc[record.status] = (acc[record.status] ?? 0) + 1;
          acc.total = (acc.total ?? 0) + 1;
          return acc;
        }, {})
      : {});

  return {
    id: task.id,
    org_id: task.org_id,
    product_id: task.product_id,
    product_name: task.product?.name ?? "",
    product_key: task.product?.product_key ?? "",
    firmware_id: task.firmware_id,
    firmware_version: task.firmware?.version ?? "",
    firmware_file_url: task.firmware?.file_url ?? "",
    firmware_sha256: task.firmware?.sha256 ?? "",
    name: task.name,
    strategy: task.strategy,
    status: task.status,
    scheduled_at: task.scheduled_at?.toISOString() ?? null,
    started_at: task.started_at?.toISOString() ?? null,
    finished_at: task.finished_at?.toISOString() ?? null,
    created_by: task.created_by,
    created_at: task.created_at.toISOString(),
    record_counts: {
      total: recordCounts.total ?? 0,
      created: recordCounts.created ?? 0,
      scheduled: recordCounts.scheduled ?? 0,
      notified: recordCounts.notified ?? 0,
      downloading: recordCounts.downloading ?? 0,
      installing: recordCounts.installing ?? 0,
      success: recordCounts.success ?? 0,
      failed: recordCounts.failed ?? 0,
      cancelled: recordCounts.cancelled ?? 0
    }
  };
}

function mapRecord(record: any) {
  return {
    id: record.id,
    org_id: record.org_id,
    task_id: record.task_id,
    device_id: record.device_id,
    device_name: record.device?.name ?? "",
    device_key: record.device?.device_key ?? "",
    status: record.status,
    progress: record.progress,
    error_message: record.error_message,
    started_at: record.started_at?.toISOString() ?? null,
    finished_at: record.finished_at?.toISOString() ?? null,
    updated_at: record.updated_at.toISOString()
  };
}

async function findProductForScope(
  db: Db,
  input: AccessScope & { orgId: string; productId: string }
) {
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    }
  });

  if (!product) {
    throw otaError(404001, "产品不存在");
  }

  return product;
}

async function findFirmwareForScope(
  db: Db,
  input: AccessScope & { orgId: string; firmwareId: string }
) {
  const firmware = await db.firmware.findFirst({
    where: {
      id: input.firmwareId,
      org_id: input.orgId,
      product: ownerFilter(input)
    },
    include: { product: true }
  });

  if (!firmware) {
    throw otaError(404001, "固件不存在");
  }

  return firmware;
}

async function findTaskForScope(
  db: Db,
  input: AccessScope & { orgId: string; taskId: string }
) {
  const task = await db.otaTask.findFirst({
    where: {
      id: input.taskId,
      org_id: input.orgId,
      product: ownerFilter(input)
    },
    include: {
      product: true,
      firmware: true,
      records: true
    }
  });

  if (!task) {
    throw otaError(404001, "升级任务不存在");
  }

  return task;
}

export async function listFirmwares(
  db: Db,
  input: AccessScope & {
    orgId: string;
    productId?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const where = {
    org_id: input.orgId,
    product: ownerFilter(input),
    ...(input.productId ? { product_id: input.productId } : {})
  };
  const [total, firmwares] = await Promise.all([
    db.firmware.count({ where }),
    db.firmware.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: true }
    })
  ]);

  return {
    items: firmwares.map((firmware: any) => mapFirmware(firmware)),
    pagination: buildPagination(page, pageSize, total)
  };
}

export async function createFirmware(
  db: Db,
  input: AccessScope & {
    orgId: string;
    createdBy: string;
    productId: string;
    version: string;
    fileUrl: string;
    fileSize: number;
    sha256: string;
    releaseNote?: string | null;
  }
) {
  await findProductForScope(db, input);
  const version = assertName(input.version, "version");
  const fileUrl = input.fileUrl.trim();

  if (!fileUrl || fileUrl.length > 2048) {
    throw otaError(400001, "固件地址长度必须为 1-2048 位");
  }

  // 每用户配额:删除固件即释放名额
  const count = await db.firmware.count({
    where: {
      org_id: input.orgId,
      created_by: input.createdBy
    }
  });

  if (count >= MAX_FIRMWARES_PER_USER) {
    throw otaError(
      409001,
      `固件数量已达上限（每个用户最多 ${MAX_FIRMWARES_PER_USER} 个，可删除旧固件释放名额）`
    );
  }

  const existing = await db.firmware.findFirst({
    where: {
      product_id: input.productId,
      version
    }
  });

  if (existing) {
    throw otaError(409001, "固件版本已存在");
  }

  const firmware = await db.firmware.create({
    data: {
      id: id("fw"),
      org_id: input.orgId,
      product_id: input.productId,
      version,
      file_url: fileUrl,
      file_size: normalizeFileSize(input.fileSize),
      sha256: assertSha256(input.sha256),
      release_note: input.releaseNote,
      // 上传即可用于升级任务,不再有 draft 中间态
      status: "released",
      created_by: input.createdBy
    },
    include: { product: true }
  });

  return mapFirmware(firmware);
}

export async function getFirmware(
  db: Db,
  input: AccessScope & { orgId: string; firmwareId: string }
) {
  return mapFirmware(await findFirmwareForScope(db, input));
}

// 仅清理本地上传目录(public/uploads/firmwares)里的文件,外部 URL 不动
async function removeLocalFirmwareFile(fileUrl: string) {
  try {
    const pathname = new URL(fileUrl).pathname;

    if (!/^\/uploads\/firmwares\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(pathname)) {
      return;
    }

    await rm(path.join(process.cwd(), "public", pathname), { force: true });
  } catch {
    // 文件清理失败不阻塞记录删除
  }
}

export async function deleteFirmware(
  db: Db,
  input: AccessScope & { orgId: string; firmwareId: string }
) {
  const firmware = await findFirmwareForScope(db, input);
  const taskCount = await db.otaTask.count({
    where: { firmware_id: firmware.id }
  });

  if (taskCount > 0) {
    throw otaError(409001, "固件已被升级任务引用，请先删除相关任务");
  }

  await removeLocalFirmwareFile(firmware.file_url);
  await db.firmware.delete({ where: { id: firmware.id } });

  return { id: firmware.id, deleted: true };
}

export async function deleteOtaTask(
  db: Db,
  input: AccessScope & { orgId: string; taskId: string }
) {
  const task = await findTaskForScope(db, input);

  // 未结束的任务先取消才能删,避免设备还在上报时记录被清掉
  if (!["finished", "cancelled"].includes(task.status)) {
    throw otaError(409001, "升级任务未结束，请先取消后再删除");
  }

  await db.otaTask.delete({ where: { id: task.id } });

  return { id: task.id, deleted: true };
}

export async function createFirmwareUploadUrl(
  db: Db,
  input: AccessScope & { orgId: string; firmwareId: string }
) {
  const firmware = await findFirmwareForScope(db, input);
  const bucket = process.env.MINIO_BUCKET ?? process.env.MINIO_FIRMWARE_BUCKET;
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const objectName = `firmwares/${firmware.product.product_key}/${firmware.version}.bin`;

  if (!bucket || !endpoint || !accessKey || !secretKey) {
    return {
      method: "PUT",
      upload_url: firmware.file_url,
      object_name: objectName,
      expires_in: 0
    };
  }

  const client = new MinioClient({
    endPoint: endpoint,
    port: Number(process.env.MINIO_PORT ?? "9000"),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey,
    secretKey
  });
  const uploadUrl = await client.presignedPutObject(bucket, objectName, 3600);

  return {
    method: "PUT",
    upload_url: uploadUrl,
    object_name: objectName,
    expires_in: 3600
  };
}

async function resolveTargetDevices(
  db: Db,
  input: AccessScope & {
    orgId: string;
    productId: string;
    strategy: TargetStrategy;
  }
) {
  const targetType = input.strategy.target_type ?? "all";

  if (targetType === "devices") {
    const ids = Array.from(new Set(input.strategy.device_ids ?? []));

    if (ids.length === 0) {
      throw otaError(400001, "必须提供设备列表");
    }

    return db.device.findMany({
      where: {
        id: { in: ids },
        org_id: input.orgId,
        product_id: input.productId,
        deleted_at: null,
        ...ownerFilter(input)
      },
      include: { product: true }
    });
  }

  if (targetType === "group") {
    const groupId = input.strategy.group_id;

    if (!groupId) {
      throw otaError(400001, "必须提供设备分组");
    }

    const group = await db.deviceGroup.findFirst({
      where: {
        id: groupId,
        org_id: input.orgId,
        product_id: input.productId,
        deleted_at: null,
        ...ownerFilter(input)
      }
    });

    if (!group) {
      throw otaError(404001, "设备分组不存在");
    }

    const members = await db.deviceGroupMember.findMany({
      where: { group_id: groupId },
      include: { device: { include: { product: true } } }
    });

    return members
      .map((member: any) => member.device)
      .filter((device: any) => !device.deleted_at);
  }

  return db.device.findMany({
    where: {
      org_id: input.orgId,
      product_id: input.productId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: { product: true }
  });
}

export async function listOtaTasks(
  db: Db,
  input: AccessScope & {
    orgId: string;
    productId?: string;
    firmwareId?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const where = {
    org_id: input.orgId,
    product: ownerFilter(input),
    ...(input.productId ? { product_id: input.productId } : {}),
    ...(input.firmwareId ? { firmware_id: input.firmwareId } : {})
  };
  const [total, tasks] = await Promise.all([
    db.otaTask.count({ where }),
    db.otaTask.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: true, firmware: true, records: true }
    })
  ]);

  return {
    items: tasks.map((task: any) => mapTask(task)),
    pagination: buildPagination(page, pageSize, total)
  };
}

export async function createOtaTask(
  db: Db,
  input: AccessScope & {
    orgId: string;
    createdBy: string;
    firmwareId: string;
    name: string;
    strategy: TargetStrategy;
  }
) {
  const firmware = await findFirmwareForScope(db, {
    ...input,
    firmwareId: input.firmwareId
  });

  if (firmware.status === "deprecated") {
    throw otaError(409001, "固件已废弃");
  }

  const devices = await resolveTargetDevices(db, {
    ...input,
    productId: firmware.product_id,
    strategy: input.strategy
  });

  if (devices.length === 0) {
    throw otaError(400001, "目标设备为空");
  }

  const task = await db.otaTask.create({
    data: {
      id: id("ota"),
      org_id: input.orgId,
      product_id: firmware.product_id,
      firmware_id: firmware.id,
      name: assertName(input.name),
      strategy: input.strategy,
      created_by: input.createdBy,
      records: {
        create: devices.map((device: any) => ({
          id: id("otr"),
          org_id: input.orgId,
          device_id: device.id,
          status: "created",
          progress: 0
        }))
      }
    },
    include: { product: true, firmware: true, records: true }
  });

  return mapTask(task);
}

export async function getOtaTask(
  db: Db,
  input: AccessScope & { orgId: string; taskId: string }
) {
  return mapTask(await findTaskForScope(db, input));
}

function otaNotifyPayload(task: any) {
  return {
    task_id: task.id,
    firmware: {
      version: task.firmware.version,
      file_url: task.firmware.file_url,
      file_size: Number(task.firmware.file_size),
      sha256: task.firmware.sha256
    }
  };
}

async function emqxToken() {
  const apiUrl = process.env.EMQX_API_URL ?? "http://localhost:18083";
  const username = process.env.EMQX_DASHBOARD_USERNAME ?? "admin";
  const password = process.env.EMQX_DASHBOARD_PASSWORD ?? "public123";
  const response = await fetch(`${apiUrl}/api/v5/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw otaError(500001, "登录 EMQX 失败");
  }

  const body = (await response.json()) as { token?: string };

  if (!body.token) {
    throw otaError(500001, "登录 EMQX 失败");
  }

  return { apiUrl, token: body.token };
}

async function publishMqtt(topic: string, payload: unknown) {
  const { apiUrl, token } = await emqxToken();
  const response = await fetch(`${apiUrl}/api/v5/publish`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      topic,
      payload: JSON.stringify(payload),
      qos: 1,
      retain: false
    })
  });

  if (!response.ok) {
    throw otaError(500001, "发布 OTA 通知失败");
  }
}

export async function startOtaTask(
  db: Db,
  input: AccessScope & { orgId: string; taskId: string }
) {
  const task = await findTaskForScope(db, input);

  if (!["created", "scheduled"].includes(task.status)) {
    throw otaError(409001, "升级任务当前无法启动");
  }

  const now = new Date();
  const started = await db.otaTask.update({
    where: { id: task.id },
    data: {
      status: "running",
      started_at: now
    },
    include: { product: true, firmware: true, records: { include: { device: true } } }
  });

  await db.otaRecord.updateMany({
    where: {
      task_id: task.id,
      status: { in: ["created", "scheduled"] }
    },
    data: {
      status: "notified",
      progress: 0,
      started_at: now
    }
  });

  for (const record of started.records) {
    const topic = `/ota/${started.product.product_key}/${record.device.device_key}/upgrade/notify`;
    await publishMqtt(topic, otaNotifyPayload(started));
  }

  return getOtaTask(db, input);
}

export async function cancelOtaTask(
  db: Db,
  input: AccessScope & { orgId: string; taskId: string }
) {
  const task = await findTaskForScope(db, input);

  if (["finished", "cancelled"].includes(task.status)) {
    throw otaError(409001, "升级任务当前无法取消");
  }

  const now = new Date();
  await db.otaRecord.updateMany({
    where: {
      task_id: task.id,
      status: { notIn: ["success", "failed", "cancelled"] }
    },
    data: {
      status: "cancelled",
      error_message: "任务已取消",
      finished_at: now
    }
  });

  const cancelled = await db.otaTask.update({
    where: { id: task.id },
    data: {
      status: "cancelled",
      finished_at: now
    },
    include: { product: true, firmware: true, records: true }
  });

  return mapTask(cancelled);
}

export async function listOtaRecords(
  db: Db,
  input: AccessScope & {
    orgId: string;
    taskId: string;
    page?: number;
    pageSize?: number;
  }
) {
  await findTaskForScope(db, input);
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const where = {
    org_id: input.orgId,
    task_id: input.taskId
  };
  const [total, records] = await Promise.all([
    db.otaRecord.count({ where }),
    db.otaRecord.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { device: true }
    })
  ]);

  return {
    items: records.map((record: any) => mapRecord(record)),
    pagination: buildPagination(page, pageSize, total)
  };
}

function normalizeProgress(input: unknown) {
  const progress = Number(input);

  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(progress)));
}

export async function recordOtaProgress(
  db: Db,
  input: {
    orgId?: string;
    deviceId?: string;
    productKey?: string;
    deviceKey?: string;
    taskId: string;
    status: OtaRecordStatus;
    progress?: unknown;
    errorMessage?: string | null;
    firmwareVersion?: string | null;
  }
) {
  let deviceId = input.deviceId;

  if (!deviceId && input.productKey && input.deviceKey) {
    const device = await db.device.findFirst({
      where: {
        device_key: input.deviceKey,
        deleted_at: null,
        product: {
          product_key: input.productKey,
          deleted_at: null
        }
      }
    });
    deviceId = device?.id;
  }

  if (!deviceId) {
    throw otaError(404001, "设备不存在");
  }

  const current = await db.otaRecord.findFirst({
    where: {
      task_id: input.taskId,
      device_id: deviceId,
      ...(input.orgId ? { org_id: input.orgId } : {})
    },
    include: { task: { include: { firmware: true } } }
  });

  if (!current) {
    throw otaError(404001, "升级记录不存在");
  }

  if (current.status === "cancelled") {
    throw otaError(409001, "升级记录已取消");
  }

  const progress = input.status === "success" ? 100 : normalizeProgress(input.progress);
  const finished = ["success", "failed", "cancelled"].includes(input.status);
  const updated = await db.otaRecord.update({
    where: {
      task_id_device_id: {
        task_id: input.taskId,
        device_id: deviceId
      }
    },
    data: {
      status: input.status,
      progress,
      error_message: input.status === "failed" ? (input.errorMessage ?? "ota failed") : null,
      ...(finished ? { finished_at: new Date() } : {}),
      ...(input.status === "downloading" || input.status === "installing"
        ? { started_at: current.started_at ?? new Date() }
        : {})
    },
    include: { device: true }
  });

  if (input.status === "success") {
    await db.device.update({
      where: { id: deviceId },
      data: { firmware_version: input.firmwareVersion ?? current.task.firmware.version }
    });
  }

  await finishTaskIfComplete(db, current.task_id);
  return mapRecord(updated);
}

async function finishTaskIfComplete(db: Db, taskId: string) {
  const remaining = await db.otaRecord.count({
    where: {
      task_id: taskId,
      status: { notIn: ["success", "failed", "cancelled"] }
    }
  });

  if (remaining === 0) {
    await db.otaTask.update({
      where: { id: taskId },
      data: {
        status: "finished",
        finished_at: new Date()
      }
    });
  }
}

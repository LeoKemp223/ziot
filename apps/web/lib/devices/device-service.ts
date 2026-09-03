import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { buildPagination } from "@/lib/pagination";
import { compensateOnlineStatuses } from "./online-status";

type Db = { [key: string]: any };
type AccessScope = {
  userId?: string;
  canAccessAll?: boolean;
};

export type DeviceServiceError = Error & {
  code: 400001 | 404001 | 409001;
};

function serviceError(
  code: DeviceServiceError["code"],
  message: string
): DeviceServiceError {
  return Object.assign(new Error(message), { code });
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function deviceSecret(): string {
  // Hex encoding keeps the complete secret limited to letters and digits.
  return randomBytes(24).toString("hex");
}

function deviceKey(): string {
  return `dk_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

// 每个产品最多可创建的设备数(删除设备即释放名额;对组织管理员同样生效)
const MAX_DEVICES_PER_PRODUCT = 50;

function mapDevice(device: any, plainSecret?: string) {
  return {
    id: device.id,
    org_id: device.org_id,
    created_by: device.created_by,
    product_id: device.product_id,
    product_name: device.product?.name ?? "",
    product_key: device.product?.product_key ?? "",
    device_key: device.device_key,
    name: device.name,
    status: device.status,
    online_status: device.online_status,
    firmware_version: device.firmware_version,
    tags: device.tags ?? {},
    last_heartbeat_at: device.last_heartbeat_at?.toISOString() ?? null,
    created_at: device.created_at.toISOString(),
    updated_at: device.updated_at.toISOString(),
    ...(plainSecret ? { device_secret: plainSecret } : {})
  };
}

function deviceTopic(
  device: { product: { product_key: string }; device_key: string },
  suffix: string
) {
  return `/sys/${device.product.product_key}/${device.device_key}/${suffix}`;
}

function ownerFilter(input: AccessScope) {
  return input.canAccessAll || !input.userId ? {} : { created_by: input.userId };
}

function clampPage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 20;
  }

  return Math.min(100, Math.max(1, Math.floor(value)));
}

async function findProductForScope(
  db: Db,
  input: AccessScope & {
    orgId: string;
    productId: string;
  }
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
    throw serviceError(404001, "产品不存在");
  }

  return product;
}

export async function listDevices(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    productId?: string;
    page?: number;
    pageSize?: number;
  }
) {
  await compensateOnlineStatuses(db, input.orgId);
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const where = {
    org_id: input.orgId,
    deleted_at: null,
    ...ownerFilter(input),
    ...(input.productId ? { product_id: input.productId } : {})
  };
  const [total, devices] = await Promise.all([
    db.device.count({ where }),
    db.device.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: true }
    })
  ]);

  return {
    items: devices.map((device: any) => mapDevice(device)),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

export async function getDevice(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
  }
) {
  await compensateOnlineStatuses(db, input.orgId);
  const device = await db.device.findFirst({
    where: {
      id: input.deviceId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: { product: true }
  });

  if (!device) {
    throw serviceError(404001, "设备不存在");
  }

  return mapDevice(device);
}

export async function listDeviceTopics(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
  }
) {
  const device = await db.device.findFirst({
    where: {
      id: input.deviceId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: { product: true }
  });

  if (!device) {
    throw serviceError(404001, "设备不存在");
  }

  return [
    {
      key: "property-post",
      name: "属性上报",
      direction: "device_to_cloud",
      operation: "publish",
      topic: deviceTopic(device, "thing/property/post"),
      description: "设备发布当前属性值，平台写入 reported 状态。"
    },
    {
      key: "property-set",
      name: "属性设置下发",
      direction: "cloud_to_device",
      operation: "subscribe",
      topic: deviceTopic(device, "thing/property/set"),
      description: "设备订阅平台下发的属性设置请求。"
    },
    {
      key: "event-post",
      name: "事件上报",
      direction: "device_to_cloud",
      operation: "publish",
      topic: deviceTopic(device, "thing/event/post"),
      description: "设备发布业务事件。"
    },
    {
      key: "log-post",
      name: "日志上报",
      direction: "device_to_cloud",
      operation: "publish",
      topic: deviceTopic(device, "thing/log/post"),
      description: "设备发布运行日志。"
    },
    {
      key: "service-invoke",
      name: "控制下发 / 服务调用",
      direction: "cloud_to_device",
      operation: "subscribe",
      topic: deviceTopic(device, "thing/service/+/invoke"),
      description: "设备订阅平台下发的服务或动作类控制指令。"
    },
    {
      key: "service-reply",
      name: "服务回执",
      direction: "device_to_cloud",
      operation: "publish",
      topic: deviceTopic(device, "thing/service/{identifier}/reply"),
      description: "设备发布服务调用执行结果，identifier 对应物模型服务标识。"
    }
  ];
}

export async function createDevice(
  db: Db,
  input: {
    orgId: string;
    createdBy: string;
    userId?: string;
    canAccessAll?: boolean;
    productId: string;
    name: string;
    deviceKey?: string;
    firmwareVersion?: string;
    tags?: unknown;
  }
) {
  await findProductForScope(db, input);

  const name = input.name.trim();

  if (!name || name.length > 128) {
    throw serviceError(400001, "名称长度必须为 1-128 位");
  }

  const key = input.deviceKey?.trim() || deviceKey();

  if (!/^[A-Za-z0-9_-]{3,128}$/.test(key)) {
    throw serviceError(
      400001,
      "device_key 必须为 3-128 位字母、数字、下划线或中划线"
    );
  }

  // 每产品配额:删除设备即释放名额,组织管理员同样受限
  const deviceCount = await db.device.count({
    where: {
      org_id: input.orgId,
      product_id: input.productId,
      deleted_at: null
    }
  });

  if (deviceCount >= MAX_DEVICES_PER_PRODUCT) {
    throw serviceError(
      409001,
      `设备数量已达上限（每个产品最多 ${MAX_DEVICES_PER_PRODUCT} 个，可删除旧设备释放名额）`
    );
  }

  const existing = await db.device.findFirst({
    where: {
      product_id: input.productId,
      device_key: key
    }
  });

  if (existing) {
    throw serviceError(409001, "device_key 在该产品下已存在");
  }

  const secret = deviceSecret();
  const device = await db.device.create({
    data: {
      id: id("dev"),
      org_id: input.orgId,
      created_by: input.createdBy,
      product_id: input.productId,
      device_key: key,
      device_secret_hash: await bcrypt.hash(secret, 10),
      name,
      firmware_version: input.firmwareVersion,
      tags: typeof input.tags === "object" && input.tags !== null ? input.tags : {}
    },
    include: { product: true }
  });

  await db.deviceShadow.create({
    data: {
      device_id: device.id,
      org_id: input.orgId,
      reported: {},
      desired: {}
    }
  });

  return mapDevice(device, secret);
}

export async function updateDevice(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
    name?: string;
    status?: "active" | "disabled";
    firmwareVersion?: string | null;
    tags?: unknown;
  }
) {
  await getDevice(db, input);
  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();

    if (!name || name.length > 128) {
      throw serviceError(400001, "名称长度必须为 1-128 位");
    }

    data.name = name;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  if (input.firmwareVersion !== undefined) {
    data.firmware_version = input.firmwareVersion;
  }

  if (input.tags !== undefined) {
    data.tags = typeof input.tags === "object" && input.tags !== null ? input.tags : {};
  }

  const device = await db.device.update({
    where: { id: input.deviceId },
    data,
    include: { product: true }
  });

  return mapDevice(device);
}

export async function deleteDevice(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
  }
) {
  await getDevice(db, input);
  const device = await db.device.update({
    where: { id: input.deviceId },
    data: { deleted_at: new Date() },
    include: { product: true }
  });

  return {
    id: device.id,
    deleted_at: (device.deleted_at ?? new Date()).toISOString()
  };
}

export async function resetDeviceSecret(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
  }
) {
  await getDevice(db, input);
  const secret = deviceSecret();
  const currentDevice = await db.device.findFirst({
    where: {
      id: input.deviceId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: { product: true }
  });

  if (!currentDevice) {
    throw serviceError(404001, "设备不存在");
  }

  const device = await db.device.update({
    where: { id: input.deviceId },
    data: {
      device_secret_hash: await bcrypt.hash(secret, 10)
    },
    include: { product: true }
  });

  return mapDevice(device, secret);
}

export async function getDeviceShadow(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
  }
) {
  await getDevice(db, input);
  const shadow = await db.deviceShadow.findUnique({
    where: { device_id: input.deviceId }
  });

  if (!shadow) {
    throw serviceError(404001, "设备影子不存在");
  }

  return {
    device_id: shadow.device_id,
    reported: shadow.reported,
    desired: shadow.desired,
    version: Number(shadow.version),
    updated_at: shadow.updated_at.toISOString()
  };
}

export async function listDeviceReports(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
  }
) {
  await getDevice(db, input);

  const reports = await db.deviceLog.findMany({
    where: {
      org_id: input.orgId,
      device_id: input.deviceId,
      type: { in: ["property", "event", "log"] }
    },
    orderBy: { occurred_at: "desc" },
    take: 20
  });

  return reports.map((report: any) => ({
    id: report.id,
    device_id: report.device_id,
    type: report.type,
    level: report.level,
    content: report.content,
    occurred_at: report.occurred_at.toISOString(),
    created_at: report.created_at.toISOString()
  }));
}

// 命令下发与设备上报合并后的统一记录(按时间倒序)
export type DeviceRecordItem =
  | {
      id: string;
      source: "command";
      time: string;
      identifier: string;
      request_id: string;
      status: string;
      params: unknown;
      result: unknown;
      error_message: string | null;
    }
  | {
      id: string;
      source: "report";
      time: string;
      type: string;
      level: string;
      content: unknown;
    };

// 合并取数时单个数据源最多取的行数,避免深分页时单次查询过大
const MAX_RECORDS_WINDOW = 1000;

export async function listDeviceRecords(
  db: Db,
  input: AccessScope & {
    orgId: string;
    deviceId: string;
    page?: number;
    pageSize?: number;
  }
) {
  await getDevice(db, input);

  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  // 合并后第 page 页的记录必然落在两个数据源各自的前 page*pageSize 行内
  const windowSize = Math.min(page * pageSize, MAX_RECORDS_WINDOW);
  const commandWhere = {
    org_id: input.orgId,
    device_id: input.deviceId
  };
  const reportWhere = {
    org_id: input.orgId,
    device_id: input.deviceId,
    type: { in: ["property", "event", "log"] }
  };

  const [commandTotal, reportTotal, commands, reports] = await Promise.all([
    db.deviceCommand.count({ where: commandWhere }),
    db.deviceLog.count({ where: reportWhere }),
    db.deviceCommand.findMany({
      where: commandWhere,
      orderBy: { created_at: "desc" },
      take: windowSize
    }),
    db.deviceLog.findMany({
      where: reportWhere,
      orderBy: { occurred_at: "desc" },
      take: windowSize
    })
  ]);

  const merged: DeviceRecordItem[] = [
    ...(commands as any[]).map((command) => ({
      id: command.id,
      source: "command" as const,
      time: command.created_at.toISOString(),
      identifier: command.identifier,
      request_id: command.request_id,
      status: command.status,
      params: command.params,
      result: command.result,
      error_message: command.error_message
    })),
    ...(reports as any[]).map((report) => ({
      id: report.id,
      source: "report" as const,
      time: report.occurred_at.toISOString(),
      type: report.type,
      level: report.level,
      content: report.content
    }))
  ].sort((a, b) =>
    a.time === b.time ? (a.id < b.id ? 1 : -1) : a.time < b.time ? 1 : -1
  );

  const offset = (page - 1) * pageSize;

  return {
    items: merged.slice(offset, offset + pageSize),
    pagination: buildPagination(page, pageSize, commandTotal + reportTotal)
  };
}

export async function updateDeviceDesiredShadow(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    deviceId: string;
    desired: unknown;
  }
) {
  await getDevice(db, input);

  if (
    typeof input.desired !== "object" ||
    input.desired === null ||
    Array.isArray(input.desired)
  ) {
    throw serviceError(400001, "desired 必须是 JSON 对象");
  }

  const shadow = await db.deviceShadow.update({
    where: { device_id: input.deviceId },
    data: {
      desired: input.desired,
      version: { increment: 1 }
    }
  });

  return {
    device_id: shadow.device_id,
    reported: shadow.reported,
    desired: shadow.desired,
    version: Number(shadow.version),
    updated_at: shadow.updated_at.toISOString()
  };
}

export async function listDeviceGroups(
  db: Db,
  input: AccessScope & {
    orgId: string;
  }
) {
  const groups = await db.deviceGroup.findMany({
    where: {
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    orderBy: { created_at: "desc" },
    include: { product: true, members: true }
  });

  return groups.map((group: any) => ({
    id: group.id,
    product_id: group.product_id,
    product_name: group.product.name,
    name: group.name,
    description: group.description,
    member_count: group.members.length,
    created_at: group.created_at.toISOString()
  }));
}

export async function createDeviceGroup(
  db: Db,
  input: {
    orgId: string;
    createdBy: string;
    userId?: string;
    canAccessAll?: boolean;
    productId: string;
    name: string;
    description?: string;
  }
) {
  await findProductForScope(db, input);
  const name = input.name.trim();

  if (!name || name.length > 128) {
    throw serviceError(400001, "名称长度必须为 1-128 位");
  }

  const group = await db.deviceGroup.create({
    data: {
      id: id("dgp"),
      org_id: input.orgId,
      created_by: input.createdBy,
      product_id: input.productId,
      name,
      description: input.description
    },
    include: { product: true, members: true }
  });

  return {
    id: group.id,
    product_id: group.product_id,
    product_name: group.product.name,
    name: group.name,
    description: group.description,
    member_count: 0,
    created_at: group.created_at.toISOString()
  };
}

export async function addDeviceToGroup(
  db: Db,
  input: {
    orgId: string;
    userId?: string;
    canAccessAll?: boolean;
    groupId: string;
    deviceId: string;
  }
) {
  const group = await db.deviceGroup.findFirst({
    where: {
      id: input.groupId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    }
  });

  if (!group) {
    throw serviceError(404001, "设备分组不存在");
  }

  const device = await db.device.findFirst({
    where: {
      id: input.deviceId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    }
  });

  if (!device) {
    throw serviceError(404001, "设备不存在");
  }

  if (device.product_id !== group.product_id) {
    throw serviceError(409001, "设备和分组必须属于同一产品");
  }

  await db.deviceGroupMember.upsert({
    where: {
      group_id_device_id: {
        group_id: input.groupId,
        device_id: input.deviceId
      }
    },
    update: {},
    create: {
      group_id: input.groupId,
      device_id: input.deviceId
    }
  });

  return { group_id: input.groupId, device_id: input.deviceId };
}

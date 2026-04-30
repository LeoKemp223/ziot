type Db = { [key: string]: any };

type AccessScope = {
  userId?: string;
  canAccessAll?: boolean;
};

type PageInput = {
  page?: number;
  pageSize?: number;
};

type TimeInput = {
  startTime?: Date;
  endTime?: Date;
};

type DeviceLogInput = AccessScope &
  PageInput &
  TimeInput & {
    orgId: string;
    productId?: string;
    deviceId?: string;
    type?: string;
    level?: string;
    keyword?: string;
  };

type CommandLogInput = AccessScope &
  PageInput &
  TimeInput & {
    orgId: string;
    productId?: string;
    deviceId?: string;
    status?: string;
    keyword?: string;
  };

type OtaLogInput = AccessScope &
  PageInput &
  TimeInput & {
    orgId: string;
    productId?: string;
    deviceId?: string;
    taskId?: string;
    status?: string;
    keyword?: string;
  };

function page(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function pageSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 20;
  }

  return Math.min(Math.floor(value), 100);
}

function ownerFilter(input: AccessScope) {
  return input.canAccessAll || !input.userId ? {} : { created_by: input.userId };
}

function timeRange(input: TimeInput, field: string) {
  if (!input.startTime && !input.endTime) {
    return {};
  }

  return {
    [field]: {
      ...(input.startTime ? { gte: input.startTime } : {}),
      ...(input.endTime ? { lte: input.endTime } : {})
    }
  };
}

function pagination(total: number, currentPage: number, currentPageSize: number) {
  return {
    page: currentPage,
    page_size: currentPageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / currentPageSize))
  };
}

function containsKeyword(keyword?: string) {
  const value = keyword?.trim();
  return value ? { string_contains: value } : undefined;
}

export async function listDeviceLogs(db: Db, input: DeviceLogInput) {
  const currentPage = page(input.page);
  const currentPageSize = pageSize(input.pageSize);
  const where = {
    org_id: input.orgId,
    ...(input.productId ? { product_id: input.productId } : {}),
    ...(input.deviceId ? { device_id: input.deviceId } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.level ? { level: input.level } : {}),
    ...timeRange(input, "occurred_at"),
    device: ownerFilter(input)
  };
  const keyword = input.keyword?.trim().toLowerCase();

  if (keyword) {
    const logs = await db.deviceLog.findMany({
      where,
      orderBy: { occurred_at: "desc" },
      take: 1000,
      include: { product: true, device: true }
    });
    const filtered = logs.filter((log: any) =>
      JSON.stringify(log.content ?? {}).toLowerCase().includes(keyword)
    );
    const start = (currentPage - 1) * currentPageSize;

    return {
      items: filtered.slice(start, start + currentPageSize).map((log: any) => ({
        id: log.id,
        org_id: log.org_id,
        product_id: log.product_id,
        product_name: log.product?.name ?? "",
        product_key: log.product?.product_key ?? "",
        device_id: log.device_id,
        device_name: log.device?.name ?? "",
        device_key: log.device?.device_key ?? "",
        type: log.type,
        level: log.level,
        content: log.content,
        occurred_at: log.occurred_at.toISOString(),
        created_at: log.created_at.toISOString()
      })),
      pagination: pagination(filtered.length, currentPage, currentPageSize)
    };
  }

  const [total, logs] = await Promise.all([
    db.deviceLog.count({ where }),
    db.deviceLog.findMany({
      where,
      orderBy: { occurred_at: "desc" },
      skip: (currentPage - 1) * currentPageSize,
      take: currentPageSize,
      include: { product: true, device: true }
    })
  ]);

  return {
    items: logs.map((log: any) => ({
      id: log.id,
      org_id: log.org_id,
      product_id: log.product_id,
      product_name: log.product?.name ?? "",
      product_key: log.product?.product_key ?? "",
      device_id: log.device_id,
      device_name: log.device?.name ?? "",
      device_key: log.device?.device_key ?? "",
      type: log.type,
      level: log.level,
      content: log.content,
      occurred_at: log.occurred_at.toISOString(),
      created_at: log.created_at.toISOString()
    })),
    pagination: pagination(total, currentPage, currentPageSize)
  };
}

export async function listCommandLogs(db: Db, input: CommandLogInput) {
  const currentPage = page(input.page);
  const currentPageSize = pageSize(input.pageSize);
  const keyword = input.keyword?.trim();
  const where = {
    org_id: input.orgId,
    ...(input.deviceId ? { device_id: input.deviceId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(timeRange(input, "created_at")),
    device: {
      ...ownerFilter(input),
      ...(input.productId ? { product_id: input.productId } : {})
    },
    ...(keyword
      ? {
          OR: [
            { identifier: { contains: keyword, mode: "insensitive" } },
            { request_id: { contains: keyword, mode: "insensitive" } },
            { error_message: { contains: keyword, mode: "insensitive" } }
          ]
        }
      : {})
  };
  const [total, logs] = await Promise.all([
    db.deviceCommand.count({ where }),
    db.deviceCommand.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (currentPage - 1) * currentPageSize,
      take: currentPageSize,
      include: { device: { include: { product: true } } }
    })
  ]);

  return {
    items: logs.map((log: any) => ({
      id: log.id,
      org_id: log.org_id,
      product_id: log.device?.product_id ?? "",
      product_name: log.device?.product?.name ?? "",
      product_key: log.device?.product?.product_key ?? "",
      device_id: log.device_id,
      device_name: log.device?.name ?? "",
      device_key: log.device?.device_key ?? "",
      identifier: log.identifier,
      params: log.params,
      status: log.status,
      request_id: log.request_id,
      result: log.result,
      error_code: log.error_code,
      error_message: log.error_message,
      timeout_at: log.timeout_at.toISOString(),
      sent_at: log.sent_at?.toISOString() ?? null,
      replied_at: log.replied_at?.toISOString() ?? null,
      created_at: log.created_at.toISOString()
    })),
    pagination: pagination(total, currentPage, currentPageSize)
  };
}

export async function listOtaLogs(db: Db, input: OtaLogInput) {
  const currentPage = page(input.page);
  const currentPageSize = pageSize(input.pageSize);
  const keyword = input.keyword?.trim();
  const where = {
    org_id: input.orgId,
    ...(input.deviceId ? { device_id: input.deviceId } : {}),
    ...(input.taskId ? { task_id: input.taskId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...timeRange(input, "updated_at"),
    device: ownerFilter(input),
    task: {
      ...(input.productId ? { product_id: input.productId } : {}),
      ...(keyword ? { name: { contains: keyword, mode: "insensitive" } } : {})
    }
  };
  const [total, logs] = await Promise.all([
    db.otaRecord.count({ where }),
    db.otaRecord.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (currentPage - 1) * currentPageSize,
      take: currentPageSize,
      include: {
        device: { include: { product: true } },
        task: { include: { firmware: true } }
      }
    })
  ]);

  return {
    items: logs.map((log: any) => ({
      id: log.id,
      org_id: log.org_id,
      product_id: log.device?.product_id ?? log.task?.product_id ?? "",
      product_name: log.device?.product?.name ?? "",
      product_key: log.device?.product?.product_key ?? "",
      task_id: log.task_id,
      task_name: log.task?.name ?? "",
      firmware_version: log.task?.firmware?.version ?? "",
      device_id: log.device_id,
      device_name: log.device?.name ?? "",
      device_key: log.device?.device_key ?? "",
      status: log.status,
      progress: log.progress,
      error_message: log.error_message,
      started_at: log.started_at?.toISOString() ?? null,
      finished_at: log.finished_at?.toISOString() ?? null,
      updated_at: log.updated_at.toISOString()
    })),
    pagination: pagination(total, currentPage, currentPageSize)
  };
}

export async function cleanupRetainedLogs(
  db: Db,
  input: {
    deviceLogDays?: number;
    commandDays?: number;
    otaDays?: number;
    auditDays?: number;
  } = {}
) {
  const now = Date.now();
  const days = (value: number | undefined, fallback: number, max?: number) => {
    const normalized = Number.isFinite(value) && value && value > 0 ? value : fallback;
    return max ? Math.min(normalized, max) : normalized;
  };
  const cutoff = (retentionDays: number) =>
    new Date(now - retentionDays * 24 * 60 * 60 * 1000);

  const [deviceLogs, commands, otaRecords, audits] = await Promise.all([
    db.deviceLog.deleteMany({
      where: { occurred_at: { lt: cutoff(days(input.deviceLogDays, 7, 15)) } }
    }),
    db.deviceCommand.deleteMany({
      where: { created_at: { lt: cutoff(days(input.commandDays, 30)) } }
    }),
    db.otaRecord.deleteMany({
      where: { updated_at: { lt: cutoff(days(input.otaDays, 180)) } }
    }),
    db.auditLog.deleteMany({
      where: { created_at: { lt: cutoff(days(input.auditDays, 180)) } }
    })
  ]);

  return {
    device_logs: deviceLogs.count,
    commands: commands.count,
    ota_records: otaRecords.count,
    audit_logs: audits.count
  };
}

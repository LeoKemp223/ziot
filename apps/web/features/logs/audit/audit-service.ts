import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type Db = { [key: string]: any };

type AuditActor = {
  id: string;
  current_org_id: string;
};

type AuditLogInput = {
  user: AuditActor;
  action: string;
  resourceType: string;
  resourceId: string;
  request?: NextRequest;
  detail?: unknown;
};

type ListAuditLogsInput = {
  orgId: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  startTime?: Date;
  endTime?: Date;
  page?: number;
  pageSize?: number;
};

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function clientIp(request?: NextRequest): string {
  const forwardedFor = request?.headers.get("x-forwarded-for");
  const realIp = request?.headers.get("x-real-ip");
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp?.trim();

  return candidate || "0.0.0.0";
}

function userAgent(request?: NextRequest): string | null {
  return request?.headers.get("user-agent") ?? null;
}

function normalizePage(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function normalizePageSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 20;
  }

  return Math.min(Math.floor(value), 100);
}

function mapAuditLog(log: any) {
  return {
    id: log.id,
    org_id: log.org_id,
    user_id: log.user_id,
    user_account: log.user?.account ?? "",
    user_display_name: log.user?.display_name ?? "",
    action: log.action,
    resource_type: log.resource_type,
    resource_id: log.resource_id,
    ip: log.ip,
    user_agent: log.user_agent,
    detail: log.detail,
    created_at: log.created_at.toISOString()
  };
}

export async function writeAuditLog(db: Db, input: AuditLogInput) {
  return db.auditLog.create({
    data: {
      id: id("aud"),
      org_id: input.user.current_org_id,
      user_id: input.user.id,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      ip: clientIp(input.request),
      user_agent: userAgent(input.request),
      detail: input.detail ?? {}
    }
  });
}

export async function safeWriteAuditLog(db: Db, input: AuditLogInput) {
  await writeAuditLog(db, input).catch(() => undefined);
}

export async function listAuditLogs(db: Db, input: ListAuditLogsInput) {
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const createdAt =
    input.startTime || input.endTime
      ? {
          ...(input.startTime ? { gte: input.startTime } : {}),
          ...(input.endTime ? { lte: input.endTime } : {})
        }
      : undefined;
  const where = {
    org_id: input.orgId,
    ...(input.userId ? { user_id: input.userId } : {}),
    ...(input.action ? { action: { contains: input.action, mode: "insensitive" } } : {}),
    ...(input.resourceType
      ? { resource_type: { contains: input.resourceType, mode: "insensitive" } }
      : {}),
    ...(input.resourceId ? { resource_id: input.resourceId } : {}),
    ...(input.ip ? { ip: input.ip } : {}),
    ...(createdAt ? { created_at: createdAt } : {})
  };
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: true }
    })
  ]);

  return {
    items: logs.map((log: any) => mapAuditLog(log)),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

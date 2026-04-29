import { describe, expect, it, vi } from "vitest";
import { listAuditLogs, writeAuditLog } from "./audit-service";

const now = new Date("2026-04-29T10:00:00.000Z");

describe("audit service", () => {
  it("writes an audit log with request metadata", async () => {
    const db = {
      auditLog: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    const request = new Request("http://localhost/api", {
      headers: {
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
        "user-agent": "vitest"
      }
    }) as any;

    await writeAuditLog(db, {
      user: { id: "usr_admin", current_org_id: "org_default" },
      action: "product.create",
      resourceType: "product",
      resourceId: "prd_demo",
      request,
      detail: { name: "演示产品" }
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        org_id: "org_default",
        user_id: "usr_admin",
        action: "product.create",
        resource_type: "product",
        resource_id: "prd_demo",
        ip: "10.0.0.1",
        user_agent: "vitest",
        detail: { name: "演示产品" }
      })
    });
  });

  it("lists audit logs with filters and pagination", async () => {
    const db = {
      auditLog: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aud_demo",
            org_id: "org_default",
            user_id: "usr_admin",
            user: {
              account: "admin@example.com",
              display_name: "平台管理员"
            },
            action: "ota.start",
            resource_type: "ota_task",
            resource_id: "ota_demo",
            ip: "127.0.0.1",
            user_agent: "vitest",
            detail: {},
            created_at: now
          }
        ])
      }
    };

    const result = await listAuditLogs(db, {
      orgId: "org_default",
      action: "ota",
      resourceType: "ota_task",
      page: 1,
      pageSize: 10
    });

    expect(db.auditLog.count).toHaveBeenCalledWith({
      where: {
        org_id: "org_default",
        action: { contains: "ota", mode: "insensitive" },
        resource_type: { contains: "ota_task", mode: "insensitive" }
      }
    });
    expect(result.items[0]).toMatchObject({
      id: "aud_demo",
      user_account: "admin@example.com",
      action: "ota.start"
    });
    expect(result.pagination.total).toBe(1);
  });
});

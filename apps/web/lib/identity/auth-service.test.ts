import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  createInvitations,
  ensureDefaultOrgRoles,
  listRoles,
  loginUser,
  refreshSession,
  registerWithInvitation,
  resetPasswordWithInvitation
} from "./auth-service";

const now = new Date("2026-04-28T08:00:00.000Z");

function membership() {
  return {
    org_id: "org_default",
    organization: {
      id: "org_default",
      name: "默认组织"
    },
    role: {
      id: "role_org_admin",
      code: "org_admin",
      name: "组织管理员",
      role_permissions: [
        { permission: { code: "user:read" } },
        { permission: { code: "invite:write" } }
      ]
    }
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "usr_admin",
    account: "admin@example.com",
    password_hash: "",
    display_name: "平台管理员",
    status: "active",
    user_org_roles: [membership()],
    ...overrides
  };
}

describe("auth service", () => {
  it("logs in with a valid password and creates a refresh token", async () => {
    const passwordHash = await bcrypt.hash("Admin123456", 10);
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user({ password_hash: passwordHash })),
        update: vi.fn().mockResolvedValue({})
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const session = await loginUser(db, {
      account: "ADMIN@example.com",
      password: "Admin123456"
    });

    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { account: "admin@example.com" } })
    );
    expect(db.refreshToken.create).toHaveBeenCalledOnce();
    expect(session.user.current_org_id).toBe("org_default");
    expect(session.user.permissions).toEqual(["invite:write", "user:read"]);
    expect(session.accessToken).toContain(".");
    expect(session.refreshToken).toMatch(/^rt_/);
  });

  it("rejects invalid login credentials", async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn()
      },
      refreshToken: {
        create: vi.fn()
      }
    };

    await expect(
      loginUser(db, {
        account: "missing@example.com",
        password: "Admin123456"
      })
    ).rejects.toMatchObject({
      code: 401001,
      message: "账号或密码错误"
    });
  });

  it("creates a batch of invitations with unique plain codes", async () => {
    const db = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: "org_default", name: "默认组织" })
      },
      role: {
        findFirst: vi.fn().mockResolvedValue({ id: "role_org_admin", name: "组织管理员" })
      },
      invitation: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...data,
            used_count: 0,
            status: "active",
            created_at: now,
            organization: { name: "默认组织" },
            role: { name: "组织管理员" }
          })
        )
      }
    };

    const invitations = await createInvitations(db, {
      orgId: "org_default",
      roleId: "role_org_admin",
      createdBy: "usr_admin",
      count: 3
    });

    expect(invitations).toHaveLength(3);
    for (const invitation of invitations) {
      expect(invitation.code).toMatch(/^INV[A-HJ-NP-Z2-9]{7}$/);
    }
    expect(new Set(invitations.map((invitation) => invitation.code)).size).toBe(3);
    expect(db.invitation.create).toHaveBeenCalledTimes(3);
    expect(db.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: expect.stringMatching(/^INV[A-HJ-NP-Z2-9]{7}$/),
          code_hash: expect.any(String),
          org_id: "org_default",
          role_id: "role_org_admin",
          max_uses: 1
        })
      })
    );
  });

  it("rejects invalid invitation batch counts", async () => {
    const db = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: "org_default", name: "默认组织" })
      },
      role: {
        findFirst: vi.fn().mockResolvedValue({ id: "role_org_admin", name: "组织管理员" })
      },
      invitation: { create: vi.fn() }
    };

    await expect(
      createInvitations(db, {
        orgId: "org_default",
        roleId: "role_org_admin",
        createdBy: "usr_admin",
        count: 0
      })
    ).rejects.toMatchObject({
      code: 400001,
      message: "创建数量必须在 1-100 之间"
    });
    expect(db.invitation.create).not.toHaveBeenCalled();
  });

  it("ensures the ordinary user role with read-only permissions", async () => {
    const db = {
      role: {
        upsert: vi.fn().mockResolvedValue({
          id: "role_org_member",
          code: "org_member",
          name: "普通用户"
        })
      },
      permission: {
        findMany: vi.fn().mockResolvedValue([
          { id: "perm_product_read" },
          { id: "perm_device_read" }
        ])
      },
      rolePermission: {
        upsert: vi.fn().mockResolvedValue({})
      }
    };

    const role = await ensureDefaultOrgRoles(db, "org_default");

    expect(role).toMatchObject({
      id: "role_org_member",
      code: "org_member",
      name: "普通用户"
    });
    expect(db.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          org_id_code: {
            org_id: "org_default",
            code: "org_member"
          }
        }
      })
    );
    expect(db.permission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: {
            in: [
              "product:read",
              "product:write",
              "device:read",
              "device:write",
              "device:control",
              "ota:read",
              "ota:write",
              "ota:execute",
              "log:read"
            ]
          }
        }
      })
    );
    expect(db.rolePermission.upsert).toHaveBeenCalledTimes(2);
  });

  it("lists roles after ensuring the ordinary user role exists", async () => {
    const db = {
      role: {
        upsert: vi.fn().mockResolvedValue({
          id: "role_org_member",
          code: "org_member",
          name: "普通用户"
        }),
        findMany: vi.fn().mockResolvedValue([
          { id: "role_org_admin", code: "org_admin", name: "组织管理员" },
          { id: "role_org_member", code: "org_member", name: "普通用户" }
        ])
      },
      permission: {
        findMany: vi.fn().mockResolvedValue([])
      },
      rolePermission: {
        upsert: vi.fn()
      }
    };

    const roles = await listRoles(db, "org_default");

    expect(roles.map((role: { code: string }) => role.code)).toEqual([
      "org_admin",
      "org_member"
    ]);
    expect(db.role.findMany).toHaveBeenCalledWith({
      where: { org_id: "org_default" },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true
      }
    });
  });

  it("registers a user with a valid invitation", async () => {
    const code = "INVG6R35ZS";
    const codeHash = await bcrypt.hash(code, 10);
    const invitation = {
      id: "inv_demo",
      code_hash: codeHash,
      org_id: "org_default",
      role_id: "role_org_admin",
      max_uses: 1,
      used_count: 0,
      status: "active",
      expires_at: new Date("2026-05-01T08:00:00.000Z"),
      organization: { id: "org_default", name: "默认组织" },
      role: { id: "role_org_admin", name: "组织管理员" }
    };
    const createdUser = user({
      id: "usr_new",
      account: "13912345678",
      display_name: "新用户"
    });
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(createdUser),
        create: vi.fn().mockResolvedValue(user({ id: "usr_new" })),
      },
      invitation: {
        findMany: vi.fn().mockResolvedValue([invitation]),
        update: vi.fn().mockResolvedValue({})
      },
      userOrgRole: {
        create: vi.fn().mockResolvedValue({})
      },
      invitationUsage: {
        create: vi.fn().mockResolvedValue({})
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({})
      },
      $transaction: async (callback: any) => callback(db)
    };

    const session = await registerWithInvitation(db, {
      account: "13912345678",
      password: "Password123",
      display_name: "新用户",
      // 故意用小写,验证注册时会把邀请码 trim + 转大写后再比对
      invitation_code: code.toLowerCase()
    });

    expect(db.invitation.update).toHaveBeenCalledWith({
      where: { id: "inv_demo" },
      data: { used_count: { increment: 1 } }
    });
    expect(db.invitationUsage.create).toHaveBeenCalledOnce();
    expect(session.user.id).toBe("usr_new");
  });

  it("rejects email accounts at registration", async () => {
    const db = { user: { findUnique: vi.fn().mockResolvedValue(null) } };

    await expect(
      registerWithInvitation(db, {
        account: "newuser@example.com",
        password: "Password123",
        display_name: "新用户",
        invitation_code: "INVG6R35ZS"
      })
    ).rejects.toMatchObject({
      code: 400001,
      message: "账号必须是有效的大陆手机号"
    });
  });

  it("resets a password with an org-matched invitation", async () => {
    const code = "INVRST9999";
    const codeHash = await bcrypt.hash(code, 10);
    const invitation = {
      id: "inv_reset",
      code_hash: codeHash,
      org_id: "org_default",
      role_id: "role_org_admin",
      max_uses: 1,
      used_count: 0,
      status: "active",
      expires_at: new Date("2099-05-01T08:00:00.000Z"),
      organization: { id: "org_default", name: "默认组织" },
      role: { id: "role_org_admin", name: "组织管理员" }
    };
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user()),
        update: vi.fn().mockResolvedValue({})
      },
      invitation: {
        findMany: vi.fn().mockResolvedValue([invitation]),
        update: vi.fn().mockResolvedValue({})
      },
      invitationUsage: {
        create: vi.fn().mockResolvedValue({})
      },
      refreshToken: {
        updateMany: vi.fn().mockResolvedValue({})
      },
      $transaction: async (callback: any) => callback(db)
    };

    const reset = await resetPasswordWithInvitation(db, {
      account: "13800000001",
      password: "NewPass123456",
      invitation_code: code.toLowerCase()
    });

    expect(reset).toEqual({
      user_id: "usr_admin",
      account: "admin@example.com",
      org_id: "org_default"
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "usr_admin" },
      data: { password_hash: expect.any(String) }
    });
    const updateArg = db.user.update.mock.calls.at(0)?.[0];
    expect(
      await bcrypt.compare("NewPass123456", updateArg?.data?.password_hash ?? "")
    ).toBe(true);
    expect(db.invitation.update).toHaveBeenCalledWith({
      where: { id: "inv_reset" },
      data: { used_count: { increment: 1 } }
    });
    expect(db.invitationUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitation_id: "inv_reset",
          user_id: "usr_admin",
          org_id: "org_default",
          role_id: "role_org_admin"
        })
      })
    );
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { user_id: "usr_admin", revoked_at: null },
      data: { revoked_at: expect.any(Date) }
    });
  });

  it("rejects a reset invitation from another organization", async () => {
    const code = "INVOTHER01";
    const codeHash = await bcrypt.hash(code, 10);
    const invitation = {
      id: "inv_other",
      code_hash: codeHash,
      org_id: "org_other",
      role_id: "role_org_admin",
      max_uses: 1,
      used_count: 0,
      status: "active",
      expires_at: new Date("2099-05-01T08:00:00.000Z"),
      organization: { id: "org_other", name: "其他组织" },
      role: { id: "role_org_admin", name: "组织管理员" }
    };
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user()),
        update: vi.fn()
      },
      invitation: {
        findMany: vi.fn().mockResolvedValue([invitation]),
        update: vi.fn()
      },
      invitationUsage: { create: vi.fn() },
      refreshToken: { updateMany: vi.fn() }
    };

    await expect(
      resetPasswordWithInvitation(db, {
        account: "13800000001",
        password: "NewPass123456",
        invitation_code: code
      })
    ).rejects.toMatchObject({
      code: 400001,
      message: "邀请码与账号所在组织不匹配"
    });
    expect(db.invitation.update).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects a reset for an unknown account", async () => {
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      invitation: { findMany: vi.fn() }
    };

    await expect(
      resetPasswordWithInvitation(db, {
        account: "13900000000",
        password: "NewPass123456",
        invitation_code: "INVRST9999"
      })
    ).rejects.toMatchObject({
      code: 404001,
      message: "账号不存在"
    });
    expect(db.invitation.findMany).not.toHaveBeenCalled();
  });

  it("rotates a valid refresh token", async () => {
    const db = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rft_old",
          revoked_at: null,
          expires_at: new Date("2026-05-01T08:00:00.000Z"),
          user: user()
        }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    };

    const session = await refreshSession(db, "rt_valid");

    expect(db.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rft_old" },
      data: { revoked_at: expect.any(Date) }
    });
    expect(session.refreshToken).toMatch(/^rt_/);
  });
});

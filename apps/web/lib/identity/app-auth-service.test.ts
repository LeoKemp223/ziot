import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import {
  loginAppUser,
  mapAppAuthSession,
  refreshAppSession,
  registerAppUser,
  verifyAppAccessToken,
} from "./app-auth-service";
import { verifyAccessToken } from "./auth-service";

const jwtSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "local-development-secret-change-before-production"
);

function appUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "app_user1",
    phone: "13912345678",
    password_hash: "",
    nickname: "小明",
    status: "active",
    created_at: new Date("2026-09-03T08:00:00.000Z"),
    ...overrides,
  };
}

describe("app auth service", () => {
  it("registers an app user and returns bearer session in body shape", async () => {
    const db = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(appUserRecord()),
      },
      appRefreshToken: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const session = await registerAppUser(db, {
      phone: "13912345678",
      password: "Pass1234",
      nickname: "小明",
    });

    expect(db.appUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: "13912345678",
        nickname: "小明",
      }),
    });
    expect(session.refreshToken).toMatch(/^art_/);
    expect(session.accessToken.split(".")).toHaveLength(3);

    const mapped = mapAppAuthSession(session);
    expect(mapped.access_token).toBe(session.accessToken);
    expect(mapped.user.phone).toBe("13912345678");

    const verified = await verifyAppAccessToken(session.accessToken);
    expect(verified.appUserId).toBe("app_user1");
  });

  it("rejects duplicate phone registration with 409001", async () => {
    const db = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(appUserRecord()),
      },
    };

    await expect(
      registerAppUser(db, { phone: "13912345678", password: "Pass1234" })
    ).rejects.toMatchObject({ code: 409001 });
  });

  it("rejects invalid phone format", async () => {
    const db = { appUser: { findUnique: vi.fn() } };

    await expect(
      registerAppUser(db, { phone: "12345", password: "Pass1234" })
    ).rejects.toMatchObject({ code: 400001 });
  });

  it("logs in with a valid password", async () => {
    const passwordHash = await bcrypt.hash("Pass1234", 4);
    const db = {
      appUser: {
        findUnique: vi
          .fn()
          .mockResolvedValue(appUserRecord({ password_hash: passwordHash })),
        update: vi.fn().mockResolvedValue({}),
      },
      appRefreshToken: { create: vi.fn().mockResolvedValue({}) },
    };

    const session = await loginAppUser(db, {
      phone: "13912345678",
      password: "Pass1234",
    });

    expect(session.user.id).toBe("app_user1");
  });

  it("rejects wrong password with 401001", async () => {
    const passwordHash = await bcrypt.hash("Pass1234", 4);
    const db = {
      appUser: {
        findUnique: vi
          .fn()
          .mockResolvedValue(appUserRecord({ password_hash: passwordHash })),
      },
    };

    await expect(
      loginAppUser(db, { phone: "13912345678", password: "Wrong123" })
    ).rejects.toMatchObject({ code: 401001 });
  });

  it("rotates refresh tokens and revokes the old one", async () => {
    const passwordHash = await bcrypt.hash("Pass1234", 4);
    const record = {
      id: "art_old",
      token_hash: "hash_old",
      expires_at: new Date(Date.now() + 86_400_000),
      revoked_at: null,
      app_user: appUserRecord({ password_hash: passwordHash }),
    };
    const db = {
      appRefreshToken: {
        findUnique: vi.fn().mockResolvedValue(record),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const session = await refreshAppSession(db, "art_old_plain");

    expect(db.appRefreshToken.update).toHaveBeenCalledWith({
      where: { id: "art_old" },
      data: { revoked_at: expect.any(Date) },
    });
    expect(session.refreshToken).toMatch(/^art_/);
  });

  it("rejects revoked refresh tokens", async () => {
    const db = {
      appRefreshToken: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(refreshAppSession(db, "art_unknown")).rejects.toMatchObject({
      code: 401001,
    });
  });

  it("isolates app tokens from console sessions", async () => {
    // 控制台令牌(无 utype 声明)不能通过 App 校验
    const consoleToken = await new SignJWT({ account: "13800000001" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("usr_admin")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(jwtSecret);

    await expect(verifyAppAccessToken(consoleToken)).rejects.toMatchObject({
      code: 401001,
    });

    // App 令牌(utype=app)不能通过控制台校验
    const appToken = await new SignJWT({ utype: "app" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("app_user1")
      .setAudience("ziot-app")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(jwtSecret);

    await expect(verifyAccessToken(appToken)).rejects.toMatchObject({
      code: 401001,
    });
  });
});

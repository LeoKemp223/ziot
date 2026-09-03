import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export type AppAuthError = Error & {
  code: 400001 | 401001 | 403001 | 404001 | 409001 | 429001 | 500001;
};

type Db = {
  [key: string]: any;
  $transaction?: <T>(callback: (tx: Db) => Promise<T>) => Promise<T>;
};

export type AppSessionUser = {
  id: string;
  phone: string;
  nickname: string;
  status: string;
  created_at: string;
};

export type AppAuthSession = {
  user: AppSessionUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
};

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_JWT_SECRET = "local-development-secret-change-before-production";

function serviceError(code: AppAuthError["code"], message: string): AppAuthError {
  return Object.assign(new Error(message), { code });
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET);
}

function addSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function opaqueRefreshToken(): string {
  return `art_${randomBytes(32).toString("base64url")}`;
}

function assertPhone(phone: string) {
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw serviceError(400001, "手机号必须是有效的大陆手机号");
  }
}

function assertPassword(password: string) {
  if (password.length < 8 || password.length > 128) {
    throw serviceError(400001, "密码长度必须为 8-128 位");
  }
}

function assertNickname(nickname: string) {
  if (!nickname || nickname.length > 128) {
    throw serviceError(400001, "昵称长度必须为 1-128 位");
  }
}

function toAppSessionUser(user: {
  id: string;
  phone: string;
  nickname: string;
  status: string;
  created_at: Date;
}): AppSessionUser {
  if (user.status !== "active") {
    throw serviceError(403001, "账号已被禁用");
  }

  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    status: user.status,
    created_at: user.created_at.toISOString()
  };
}

// App 访问令牌与控制台会话共用 JWT_SECRET,凭 utype/aud 声明互相隔离
async function signAppAccessToken(user: AppSessionUser): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const expiresAt = addSeconds(ACCESS_TOKEN_TTL_SECONDS);
  const token = await new SignJWT({ utype: "app", phone: user.phone })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("ziot-app")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getJwtSecret());

  return { token, expiresAt };
}

export async function verifyAppAccessToken(token: string): Promise<{
  appUserId: string;
}> {
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];

  try {
    payload = (await jwtVerify(token, getJwtSecret(), {
      audience: "ziot-app"
    })).payload;
  } catch {
    throw serviceError(401001, "登录已过期，请重新登录");
  }

  if (!payload.sub || payload.utype !== "app") {
    throw serviceError(401001, "登录已过期，请重新登录");
  }

  return { appUserId: payload.sub };
}

export async function loadAppUser(
  db: Db,
  appUserId: string
): Promise<AppSessionUser> {
  const user = await db.appUser.findUnique({ where: { id: appUserId } });

  if (!user) {
    throw serviceError(401001, "登录已过期，请重新登录");
  }

  return toAppSessionUser(user);
}

async function createAppSession(
  db: Db,
  user: {
    id: string;
    phone: string;
    nickname: string;
    status: string;
    created_at: Date;
  }
): Promise<AppAuthSession> {
  const sessionUser = toAppSessionUser(user);
  const access = await signAppAccessToken(sessionUser);
  const refreshToken = opaqueRefreshToken();
  const refreshTokenExpiresAt = addSeconds(REFRESH_TOKEN_TTL_SECONDS);

  await db.appRefreshToken.create({
    data: {
      id: id("art"),
      app_user_id: user.id,
      token_hash: sha256(refreshToken),
      expires_at: refreshTokenExpiresAt
    }
  });

  return {
    user: sessionUser,
    accessToken: access.token,
    refreshToken,
    accessTokenExpiresAt: access.expiresAt,
    refreshTokenExpiresAt
  };
}

export function mapAppAuthSession(session: AppAuthSession) {
  return {
    user: session.user,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    access_token_expires_at: session.accessTokenExpiresAt.toISOString(),
    refresh_token_expires_at: session.refreshTokenExpiresAt.toISOString()
  };
}

export async function registerAppUser(
  db: Db,
  input: { phone: string; password: string; nickname?: string }
): Promise<AppAuthSession> {
  const phone = input.phone.trim();
  const nickname = (input.nickname ?? `用户${phone.slice(-4)}`).trim();

  assertPhone(phone);
  assertPassword(input.password);
  assertNickname(nickname);

  const existing = await db.appUser.findUnique({ where: { phone } });

  if (existing) {
    throw serviceError(409001, "手机号已注册");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await db.appUser.create({
    data: {
      id: id("app"),
      phone,
      password_hash: passwordHash,
      nickname
    }
  });

  return createAppSession(db, user);
}

export async function loginAppUser(
  db: Db,
  input: { phone: string; password: string }
): Promise<AppAuthSession> {
  const phone = input.phone.trim();
  assertPhone(phone);

  const user = await db.appUser.findUnique({ where: { phone } });

  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw serviceError(401001, "手机号或密码错误");
  }

  if (user.status !== "active") {
    throw serviceError(403001, "账号已被禁用");
  }

  await db.appUser.update({
    where: { id: user.id },
    data: { last_login_at: new Date() }
  });

  return createAppSession(db, user);
}

export async function refreshAppSession(
  db: Db,
  refreshToken: string
): Promise<AppAuthSession> {
  const tokenHash = sha256(refreshToken);
  const record = await db.appRefreshToken.findUnique({
    where: { token_hash: tokenHash },
    include: { app_user: true }
  });

  if (
    !record ||
    record.revoked_at ||
    record.expires_at <= new Date() ||
    record.app_user.status !== "active"
  ) {
    throw serviceError(401001, "无效的刷新令牌");
  }

  await db.appRefreshToken.update({
    where: { id: record.id },
    data: { revoked_at: new Date() }
  });

  return createAppSession(db, record.app_user);
}

export async function logoutAppUser(
  db: Db,
  refreshToken: string | undefined
) {
  if (!refreshToken) {
    return;
  }

  await db.appRefreshToken.updateMany({
    where: {
      token_hash: sha256(refreshToken),
      revoked_at: null
    },
    data: { revoked_at: new Date() }
  });
}

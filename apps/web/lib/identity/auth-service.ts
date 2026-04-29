import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { mergePermissions } from "@ziot/domain";

export type IdentityError = Error & {
  code: 400001 | 401001 | 403001 | 404001 | 409001 | 500001;
};

type Db = {
  [key: string]: any;
  $transaction?: <T>(callback: (tx: Db) => Promise<T>) => Promise<T>;
};

type OrgRoleRecord = {
  org_id: string;
  role: {
    id: string;
    code: string;
    name: string;
    role_permissions?: Array<{
      permission: {
        code: string;
      };
    }>;
  };
  organization: {
    id: string;
    name: string;
  };
};

export type SessionUser = {
  id: string;
  account: string;
  display_name: string;
  current_org_id: string;
  organizations: Array<{
    id: string;
    name: string;
    roles: Array<{
      id: string;
      code: string;
      name: string;
    }>;
  }>;
  permissions: string[];
};

export type AuthSession = {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
};

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_JWT_SECRET = "local-development-secret-change-before-production";
const MEMBER_ROLE_CODE = "org_member";
const MEMBER_ROLE_NAME = "普通用户";
const MEMBER_PERMISSION_CODES = [
  "product:read",
  "product:write",
  "device:read",
  "device:write",
  "device:control",
  "ota:read",
  "ota:write",
  "ota:execute",
  "log:read"
];

function serviceError(
  code: IdentityError["code"],
  message: string
): IdentityError {
  return Object.assign(new Error(message), { code });
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function normalizeAccount(account: string): string {
  return account.trim().toLowerCase();
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

function publicInvitationCode(): string {
  return `inv_${randomBytes(18).toString("base64url")}`;
}

function opaqueRefreshToken(): string {
  return `rt_${randomBytes(32).toString("base64url")}`;
}

function assertPassword(password: string) {
  if (password.length < 8 || password.length > 128) {
    throw serviceError(400001, "password must be 8-128 characters");
  }
}

function assertAccount(account: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) {
    throw serviceError(400001, "account must be a valid email");
  }
}

function assertDisplayName(displayName: string) {
  if (!displayName || displayName.length > 128) {
    throw serviceError(400001, "display_name must be 1-128 characters");
  }
}

function groupOrganizations(memberships: OrgRoleRecord[]) {
  const orgs = new Map<
    string,
    {
      id: string;
      name: string;
      roles: Array<{ id: string; code: string; name: string }>;
      permissions: string[][];
    }
  >();

  for (const membership of memberships) {
    const existing =
      orgs.get(membership.org_id) ??
      {
        id: membership.organization.id,
        name: membership.organization.name,
        roles: [],
        permissions: []
      };

    existing.roles.push({
      id: membership.role.id,
      code: membership.role.code,
      name: membership.role.name
    });
    existing.permissions.push(
      membership.role.role_permissions?.map(
        (item) => item.permission.code
      ) ?? []
    );
    orgs.set(membership.org_id, existing);
  }

  return [...orgs.values()];
}

export async function toSessionUser(
  user: {
    id: string;
    account: string;
    display_name: string;
    status: string;
    user_org_roles?: OrgRoleRecord[];
  },
  currentOrgId?: string
): Promise<SessionUser> {
  if (user.status !== "active") {
    throw serviceError(403001, "user is disabled");
  }

  const organizations = groupOrganizations(user.user_org_roles ?? []);

  if (organizations.length === 0) {
    throw serviceError(403001, "user has no organization access");
  }

  const activeOrg =
    organizations.find((org) => org.id === currentOrgId) ?? organizations[0];

  if (!activeOrg) {
    throw serviceError(403001, "user has no organization access");
  }

  return {
    id: user.id,
    account: user.account,
    display_name: user.display_name,
    current_org_id: activeOrg.id,
    organizations: organizations.map(({ permissions: _permissions, ...org }) => org),
    permissions: mergePermissions(activeOrg.permissions)
  };
}

export async function loadSessionUser(
  db: Db,
  userId: string,
  currentOrgId?: string
): Promise<SessionUser> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: sessionUserInclude()
  });

  if (!user) {
    throw serviceError(401001, "invalid session");
  }

  return toSessionUser(user, currentOrgId);
}

function sessionUserInclude() {
  return {
    user_org_roles: {
      where: { status: "active" },
      include: {
        organization: true,
        role: {
          include: {
            role_permissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    }
  };
}

async function signAccessToken(user: SessionUser): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const expiresAt = addSeconds(ACCESS_TOKEN_TTL_SECONDS);
  const token = await new SignJWT({
    account: user.account,
    current_org_id: user.current_org_id,
    permissions: user.permissions
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getJwtSecret());

  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<{
  userId: string;
  currentOrgId?: string;
}> {
  const { payload } = await jwtVerify(token, getJwtSecret());

  if (!payload.sub) {
    throw serviceError(401001, "invalid session");
  }

  return {
    userId: payload.sub,
    ...(typeof payload.current_org_id === "string"
      ? { currentOrgId: payload.current_org_id }
      : {})
  };
}

async function createSession(
  db: Db,
  user: {
    id: string;
    account: string;
    display_name: string;
    status: string;
    user_org_roles?: OrgRoleRecord[];
  },
  currentOrgId?: string
): Promise<AuthSession> {
  const sessionUser = await toSessionUser(user, currentOrgId);
  const access = await signAccessToken(sessionUser);
  const refreshToken = opaqueRefreshToken();
  const refreshTokenExpiresAt = addSeconds(REFRESH_TOKEN_TTL_SECONDS);

  await db.refreshToken.create({
    data: {
      id: id("rft"),
      user_id: user.id,
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

export async function loginUser(
  db: Db,
  input: {
    account: string;
    password: string;
    currentOrgId?: string;
  }
): Promise<AuthSession> {
  const account = normalizeAccount(input.account);
  const user = await db.user.findUnique({
    where: { account },
    include: sessionUserInclude()
  });

  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw serviceError(401001, "invalid account or password");
  }

  await db.user.update({
    where: { id: user.id },
    data: { last_login_at: new Date() }
  });

  return createSession(db, user, input.currentOrgId);
}

export async function refreshSession(
  db: Db,
  refreshToken: string,
  currentOrgId?: string
): Promise<AuthSession> {
  const tokenHash = sha256(refreshToken);
  const record = await db.refreshToken.findUnique({
    where: { token_hash: tokenHash },
    include: {
      user: {
        include: sessionUserInclude()
      }
    }
  });

  if (!record || record.revoked_at || record.expires_at <= new Date()) {
    throw serviceError(401001, "invalid refresh token");
  }

  await db.refreshToken.update({
    where: { id: record.id },
    data: { revoked_at: new Date() }
  });

  return createSession(db, record.user, currentOrgId);
}

export async function logoutUser(db: Db, refreshToken: string | undefined) {
  if (!refreshToken) {
    return;
  }

  await db.refreshToken.updateMany({
    where: {
      token_hash: sha256(refreshToken),
      revoked_at: null
    },
    data: { revoked_at: new Date() }
  });
}

export async function registerWithInvitation(
  db: Db,
  input: {
    account: string;
    password: string;
    display_name: string;
    invitation_code: string;
  }
): Promise<AuthSession> {
  const account = normalizeAccount(input.account);
  const displayName = input.display_name.trim();

  assertAccount(account);
  assertPassword(input.password);
  assertDisplayName(displayName);

  const existingUser = await db.user.findUnique({ where: { account } });

  if (existingUser) {
    throw serviceError(409001, "account already exists");
  }

  const invitations = await db.invitation.findMany({
    where: {
      status: "active"
    },
    include: {
      organization: true,
      role: true
    }
  });
  const invitation = (
    await Promise.all(
      invitations.map(async (item: any) =>
        (await bcrypt.compare(input.invitation_code, item.code_hash))
          ? item
          : null
      )
    )
  ).find(Boolean);

  if (!invitation) {
    throw serviceError(400001, "invalid invitation code");
  }

  if (invitation.expires_at <= new Date()) {
    throw serviceError(400001, "invitation expired");
  }

  if (invitation.used_count >= invitation.max_uses) {
    throw serviceError(400001, "invitation has reached max uses");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const run = async (tx: Db) => {
    const user = await tx.user.create({
      data: {
        id: id("usr"),
        account,
        password_hash: passwordHash,
        display_name: displayName
      },
      include: sessionUserInclude()
    });

    await tx.userOrgRole.create({
      data: {
        id: id("uor"),
        user_id: user.id,
        org_id: invitation.org_id,
        role_id: invitation.role_id
      }
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { used_count: { increment: 1 } }
    });
    await tx.invitationUsage.create({
      data: {
        id: id("inu"),
        invitation_id: invitation.id,
        user_id: user.id,
        org_id: invitation.org_id,
        role_id: invitation.role_id
      }
    });

    return tx.user.findUnique({
      where: { id: user.id },
      include: sessionUserInclude()
    });
  };
  const user = db.$transaction ? await db.$transaction(run) : await run(db);

  return createSession(db, user, invitation.org_id);
}

export async function createInvitation(
  db: Db,
  input: {
    orgId: string;
    roleId: string;
    createdBy: string;
    maxUses?: number;
    expiresAt?: Date;
  }
) {
  const maxUses = input.maxUses ?? 1;

  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw serviceError(400001, "max_uses must be 1-100");
  }

  const [org, role] = await Promise.all([
    db.organization.findUnique({ where: { id: input.orgId } }),
    db.role.findFirst({
      where: {
        id: input.roleId,
        org_id: input.orgId
      }
    })
  ]);

  if (!org || !role) {
    throw serviceError(404001, "organization or role not found");
  }

  const code = publicInvitationCode();
  const invitation = await db.invitation.create({
    data: {
      id: id("inv"),
      code_hash: await bcrypt.hash(code, 10),
      org_id: input.orgId,
      role_id: input.roleId,
      max_uses: maxUses,
      expires_at: input.expiresAt ?? addSeconds(7 * 24 * 60 * 60),
      created_by: input.createdBy
    },
    include: {
      organization: true,
      role: true
    }
  });

  return {
    ...mapInvitation(invitation),
    code
  };
}

export async function listInvitations(db: Db, orgId: string) {
  const invitations = await db.invitation.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "desc" },
    include: {
      organization: true,
      role: true
    }
  });

  return invitations.map(mapInvitation);
}

export async function getInvitation(db: Db, orgId: string, invitationId: string) {
  const invitation = await db.invitation.findFirst({
    where: {
      id: invitationId,
      org_id: orgId
    },
    include: {
      organization: true,
      role: true,
      usages: {
        include: {
          user: true
        },
        orderBy: { used_at: "desc" }
      }
    }
  });

  if (!invitation) {
    throw serviceError(404001, "invitation not found");
  }

  return {
    ...mapInvitation(invitation),
    usages: invitation.usages.map((usage: any) => ({
      id: usage.id,
      user_id: usage.user_id,
      account: usage.user.account,
      display_name: usage.user.display_name,
      used_at: usage.used_at.toISOString()
    }))
  };
}

export async function disableInvitation(
  db: Db,
  orgId: string,
  invitationId: string
) {
  await getInvitation(db, orgId, invitationId);

  const invitation = await db.invitation.update({
    where: { id: invitationId },
    data: { status: "disabled" },
    include: {
      organization: true,
      role: true
    }
  });

  return mapInvitation(invitation);
}

export async function ensureDefaultOrgRoles(db: Db, orgId: string) {
  const role = await db.role.upsert({
    where: {
      org_id_code: {
        org_id: orgId,
        code: MEMBER_ROLE_CODE
      }
    },
    update: {
      name: MEMBER_ROLE_NAME
    },
    create: {
      id: id("rol"),
      org_id: orgId,
      code: MEMBER_ROLE_CODE,
      name: MEMBER_ROLE_NAME,
      description: "可查看产品、设备、OTA 和日志的普通成员"
    }
  });

  const permissions = await db.permission.findMany({
    where: {
      code: {
        in: MEMBER_PERMISSION_CODES
      }
    },
    select: {
      id: true
    }
  });

  await Promise.all(
    permissions.map((permission: { id: string }) =>
      db.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: role.id,
            permission_id: permission.id
          }
        },
        update: {},
        create: {
          role_id: role.id,
          permission_id: permission.id
        }
      })
    )
  );

  return role;
}

export async function listRoles(db: Db, orgId: string) {
  await ensureDefaultOrgRoles(db, orgId);

  return db.role.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true
    }
  });
}

export async function listUsers(db: Db, orgId: string) {
  const memberships = await db.userOrgRole.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "desc" },
    include: {
      user: true,
      role: true,
      organization: true
    }
  });

  return memberships.map((membership: any) => ({
    id: membership.user.id,
    account: membership.user.account,
    display_name: membership.user.display_name,
    status: membership.user.status,
    role: {
      id: membership.role.id,
      code: membership.role.code,
      name: membership.role.name
    },
    organization: {
      id: membership.organization.id,
      name: membership.organization.name
    },
    created_at: membership.user.created_at.toISOString(),
    last_login_at: membership.user.last_login_at?.toISOString() ?? null
  }));
}

function mapInvitation(invitation: any) {
  return {
    id: invitation.id,
    org_id: invitation.org_id,
    organization_name: invitation.organization?.name ?? "",
    role_id: invitation.role_id,
    role_name: invitation.role?.name ?? "",
    max_uses: invitation.max_uses,
    used_count: invitation.used_count,
    status: invitation.status,
    expires_at: invitation.expires_at.toISOString(),
    created_at: invitation.created_at.toISOString()
  };
}

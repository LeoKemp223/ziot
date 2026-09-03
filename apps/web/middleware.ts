import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const publicPaths = ["/login", "/register", "/reset-password"];
const DEFAULT_JWT_SECRET = "local-development-secret-change-before-production";
const protectedPagePermissions = [
  { path: "/products", permission: "product:read" },
  { path: "/devices", permission: "device:read" },
  { path: "/controls", permission: "device:control" },
  { path: "/ota", permission: "ota:read" },
  { path: "/logs", permission: "audit:read" },
  { path: "/users", permission: "user:read" },
  { path: "/invitations", permission: "invite:read" },
  { path: "/settings", permission: "user:write" }
];

function jwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET
  );
}

async function tokenPermissions(token: string): Promise<string[]> {
  const { payload } = await jwtVerify(token, jwtSecret());
  const permissions = payload.permissions;

  return Array.isArray(permissions)
    ? permissions.filter((permission): permission is string => typeof permission === "string")
    : [];
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// access token 过期但刷新令牌还在:先去 session-renew 静默续期再跳回本页
function redirectToSessionRenew(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/api/v1/auth/session-renew";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    publicPaths.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("ziot_access_token")?.value;
  // access cookie 到期即被浏览器删除,刷新令牌 cookie(30 天)通常还在
  const canRenew = Boolean(request.cookies.get("ziot_refresh_token")?.value);

  if (!token) {
    return canRenew ? redirectToSessionRenew(request) : redirectToLogin(request);
  }

  const requiredPermission = protectedPagePermissions.find(({ path }) =>
    pathname === path || pathname.startsWith(`${path}/`)
  )?.permission;

  if (token && requiredPermission) {
    try {
      const permissions = await tokenPermissions(token);

      if (!permissions.includes(requiredPermission)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        url.searchParams.set("forbidden", pathname);
        return NextResponse.redirect(url);
      }
    } catch {
      // 令牌存在但校验失败(通常已过期):能续期先续期
      return canRenew
        ? redirectToSessionRenew(request)
        : redirectToLogin(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"]
};

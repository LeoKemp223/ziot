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
  const hasSession = Boolean(token);

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
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
        url.searchParams.set("forbidden", pathname);
        return NextResponse.redirect(url);
      }
    } catch {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"]
};

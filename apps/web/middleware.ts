import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    publicPaths.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/device-api/") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get("ziot_access_token")?.value);

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"]
};

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { refreshSession } from "@/lib/identity/auth-service";
import {
  CURRENT_ORG_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies
} from "@/lib/identity/session";
import { requestOrigin, redirectToPath } from "@/lib/request-origin";

export const runtime = "nodejs";

// 供 middleware 在 access token 过期时 302 过来静默续期,再跳回原页面;
// 续期失败(刷新令牌也无效)才落到登录页。

// 只允许站内相对路径,防止开放重定向
function safeNextPath(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}

export async function GET(request: NextRequest) {
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return redirectToPath(request, "/login", { next: nextPath });
  }

  try {
    const session = await refreshSession(
      prisma,
      refreshToken,
      request.cookies.get(CURRENT_ORG_COOKIE)?.value
    );
    const response = NextResponse.redirect(new URL(nextPath, requestOrigin(request)));
    setSessionCookies(response, session);

    return response;
  } catch {
    return redirectToPath(request, "/login", { next: nextPath });
  }
}

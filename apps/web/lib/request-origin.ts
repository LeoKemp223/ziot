import { type NextRequest, NextResponse } from "next/server";

// 代理后构造外部可见的绝对地址:优先取转发头,避免 nextUrl.origin
// 取到服务内部绑定地址(如 0.0.0.0:3000)导致重定向/外链指向错误主机。
export function requestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    return `${forwardedProto ?? request.nextUrl.protocol.replace(":", "")}://${host}`;
  }

  return request.nextUrl.origin;
}

export function redirectToPath(
  request: NextRequest,
  pathname: string,
  params?: Record<string, string>
): NextResponse {
  const url = new URL(pathname, requestOrigin(request));

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

// 客户端 fetch 拦截:页面内的 /api/v1 请求遇到 401 时,用刷新令牌静默续期并
// 重试一次,避免 15 分钟 access token 过期把正在操作的用户踢回登录页。
//
// - 刷新走单飞(single-flight):refreshSession 是旋转式令牌(旧令牌立即吊销),
//   并发 401 必须共享同一次刷新,否则刷新风暴会把会话刷死;
// - 刷新失败仍重试原请求一次:另一个标签页可能刚刚完成轮换,cookie 已更新;
// - 重试仍 401 才认为会话终结,跳登录页(带上当前路径)。

type FetchLike = typeof fetch;

const INSTALLED_FLAG = "__ziotSessionFetchInstalled";

function isManagedApiPath(url: string): boolean {
  // 认证接口自身(登录/登出/刷新)不拦截,避免失败登录触发无意义刷新
  return url.startsWith("/api/v1/") && !url.startsWith("/api/v1/auth/");
}

export function installSessionFetch(): void {
  if (typeof window === "undefined") {
    return;
  }

  const scope = window as Window & { [INSTALLED_FLAG]?: boolean };
  if (scope[INSTALLED_FLAG]) {
    return;
  }
  scope[INSTALLED_FLAG] = true;

  const originalFetch: FetchLike = window.fetch.bind(window);
  let refreshInFlight: Promise<boolean> | null = null;

  function refreshSession(): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = originalFetch("/api/v1/auth/refresh", {
        method: "POST"
      })
        .then((response) => response.ok)
        .catch(() => false)
        .finally(() => {
          refreshInFlight = null;
        });
    }

    return refreshInFlight;
  }

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : input.url;
    const response = await originalFetch(input, init);

    if (response.status !== 401 || !isManagedApiPath(url)) {
      return response;
    }

    await refreshSession();

    // 无论刷新成败都重试一次(跨标签页轮换竞态的兜底)
    const retry = await originalFetch(input, init);

    if (retry.status === 401) {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }

    return retry;
  }) as typeof fetch;
}

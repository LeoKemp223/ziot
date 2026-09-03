"use client";

import { installSessionFetch } from "@/lib/client/session-fetch";

// 模块加载时安装一次 fetch 拦截(SSR 侧自动跳过),组件本身不渲染任何内容
installSessionFetch();

export function SessionKeepalive() {
  return null;
}

"use client";

import { useEffect, useState } from "react";
import { BookOpen, Bell, LogOut, PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";

type MeResponse = {
  code: number;
  data?: {
    display_name: string;
  };
};

export function ConsoleHeader() {
  const [me, setMe] = useState<MeResponse["data"] | null>(null);
  const pathname = usePathname();
  const docsActive = pathname === "/integration-docs";

  useEffect(() => {
    void fetch("/api/v1/me")
      .then((response) => response.json() as Promise<MeResponse>)
      .then((body) => {
        if (body.code === 0 && body.data) {
          setMe(body.data);
        }
      })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          aria-label="打开导航"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 lg:hidden"
          type="button"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold text-slate-950">
          ZIOT Console
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          aria-current={docsActive ? "page" : undefined}
          className={[
            "hidden h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition md:inline-flex",
            docsActive
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          ].join(" ")}
          href="/integration-docs"
        >
          <BookOpen className="h-4 w-4" />
          接入文档
        </a>
        <button
          aria-label="通知"
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600"
          type="button"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {me?.display_name.slice(0, 1) ?? "管"}
        </div>
        <button
          aria-label="退出登录"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600"
          onClick={() => void logout()}
          type="button"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

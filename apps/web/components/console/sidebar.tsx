"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ChevronRight,
  Cpu,
  FileText,
  Home,
  RadioTower,
  Settings,
  ShieldCheck,
  UploadCloud
} from "lucide-react";
import { filterNavItemsForPermissions, type NavItem } from "./dashboard-data";

const navIcons = {
  home: Home,
  box: Boxes,
  cpu: Cpu,
  radio: RadioTower,
  upload: UploadCloud,
  logs: FileText,
  users: ShieldCheck,
  settings: Settings
} satisfies Record<NavItem["icon"], typeof Home>;

type ConsoleSidebarProps = {
  items: NavItem[];
};

type MeResponse = {
  code: number;
  data?: {
    permissions: string[];
  };
};

export function ConsoleSidebar({ items }: ConsoleSidebarProps) {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const visibleItems = useMemo(
    () => filterNavItemsForPermissions(items, permissions ?? []),
    [items, permissions]
  );

  useEffect(() => {
    void fetch("/api/v1/me")
      .then((response) => response.json() as Promise<MeResponse>)
      .then((body) => {
        if (body.code === 0 && body.data) {
          setPermissions(body.data.permissions);
        }
      })
      .catch(() => {
        setPermissions([]);
      });
  }, []);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-[#141414] text-zinc-300 lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white">
          Z
        </div>
        <div>
          <div className="text-base font-semibold text-white">ZIOT Console</div>
          <div className="text-xs text-zinc-500">Device Cloud</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-5">
        {visibleItems.map((item) => {
          const Icon = navIcons[item.icon];

          return (
            <a
              aria-current={item.active ? "page" : undefined}
              className={[
                "group flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                item.active
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-950/40"
                  : "text-zinc-400 hover:bg-white/8 hover:text-white"
              ].join(" ")}
              href={item.href}
              key={item.label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.active ? <ChevronRight className="h-4 w-4" /> : null}
            </a>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="rounded-md bg-white/6 p-3">
          <div className="text-xs text-zinc-500">当前组织</div>
          <div className="mt-1 truncate text-sm font-medium text-white">
            默认组织
          </div>
        </div>
      </div>
    </aside>
  );
}

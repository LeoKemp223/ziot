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
  UploadCloud,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { filterNavItemsForPermissions, type NavItem } from "./dashboard-data";
import Link from "next/link";
import { getCachedMe, loadMe } from "@/lib/identity/me-cache";

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

export function ConsoleSidebar({ items }: ConsoleSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [permissions, setPermissions] = useState<string[] | null>(() => getCachedMe()?.permissions ?? null);
  const visibleItems = useMemo(
    () => filterNavItemsForPermissions(items, permissions ?? []),
    [items, permissions]
  );

  useEffect(() => {
    setCollapsed(localStorage.getItem("ziot-sidebar-collapsed") === "true");
    void loadMe().then((me) => setPermissions(me?.permissions ?? []));
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.dataset.sidebarCollapsed = String(next);
    localStorage.setItem("ziot-sidebar-collapsed", String(next));
  }

  return (
    <aside className={["console-sidebar sticky top-0 hidden h-screen shrink-0 flex-col text-zinc-300 transition-[width] duration-200 lg:flex", collapsed ? "w-[72px]" : "w-64"].join(" ")}>
      <div className={["flex h-16 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "gap-3 px-5"].join(" ")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white">
          Z
        </div>
        <div className={["sidebar-expanded-only", collapsed ? "hidden" : ""].join(" ")}>
          <div className="text-base font-semibold text-white">ZIOT Console</div>
          <div className="text-xs text-zinc-500">Device Cloud</div>
        </div>
      </div>
      <nav className={["flex-1 space-y-1 py-5", collapsed ? "px-2" : "px-3"].join(" ")}>
        {visibleItems.map((item) => {
          const Icon = navIcons[item.icon];

          return (
            <Link
              aria-current={item.active ? "page" : undefined}
              className={[
                "group flex h-10 items-center gap-3 rounded-md text-sm transition-colors",
                collapsed ? "justify-center px-2" : "px-3",
                item.active
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-950/40"
                  : "text-zinc-400 hover:bg-white/8 hover:text-white"
              ].join(" ")}
              href={item.href}
              key={item.label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={["sidebar-expanded-only", collapsed ? "hidden" : "min-w-0 flex-1 truncate"].join(" ")}>{item.label}</span>
              {item.active && !collapsed ? <ChevronRight className="h-4 w-4" /> : null}
            </Link>
          );
        })}
      </nav>
      <div className={["pb-3", collapsed ? "px-2" : "px-3"].join(" ")}>
        <button
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          className={[
            "flex h-10 w-full items-center rounded-md text-zinc-500 transition-colors hover:bg-white/8 hover:text-zinc-200",
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          ].join(" ")}
          onClick={toggleCollapsed}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          type="button"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed ? <span className="sidebar-expanded-only text-sm">收起侧边栏</span> : null}
        </button>
      </div>
    </aside>
  );
}

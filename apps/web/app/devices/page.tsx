import { Database } from "lucide-react";
import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { DeviceListPanel } from "@/components/devices/device-list-panel";

export const dynamic = "force-dynamic";

export default function DevicesPage() {
  const items = navItems.map((item) => ({
    ...item,
    active: item.href === "/devices"
  }));

  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <ConsoleSidebar items={items} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-950">
                  设备管理
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  管理设备实例、运行状态、分组和接入密钥。
                </p>
              </div>
              <a
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                href="/api/v1/devices"
              >
                <Database className="h-4 w-4" />
                查看 API
              </a>
            </div>

            <div className="mt-6">
              <DeviceListPanel />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

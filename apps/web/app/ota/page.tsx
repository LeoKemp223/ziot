import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { OtaConsolePanel } from "@/components/ota/ota-console-panel";

export const dynamic = "force-dynamic";

export default function OtaPage() {
  const items = navItems.map((item) => ({
    ...item,
    active: item.href === "/ota"
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
                  OTA 升级
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  管理固件版本、创建升级任务并查看设备升级进度。
                </p>
              </div>
            </div>
            <div className="mt-6">
              <OtaConsolePanel />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

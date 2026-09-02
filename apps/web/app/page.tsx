import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const items = navItems.map((item) => ({
    ...item,
    active: item.href === "/"
  }));

  return (
    <main className="dashboard-shell flex min-h-screen text-slate-950">
      <ConsoleSidebar items={items} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="dashboard-grid flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="dashboard-hero flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.7)]" />
                  ZIOT Console / Overview
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  控制台概览
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  查看当前组织设备在线、数据上报、控制命令和 OTA 运行状态。
                </p>
              </div>
            </div>
            <div className="mt-6">
              <DashboardPanel />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

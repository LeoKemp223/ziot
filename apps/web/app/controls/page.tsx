import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { ControlConsolePanel } from "@/components/controls/control-console-panel";

export const dynamic = "force-dynamic";

export default function ControlsPage() {
  const items = navItems.map((item) => ({
    ...item,
    active: item.href === "/controls"
  }));

  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <ConsoleSidebar items={items} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">设备控制</h1>
              <p className="mt-1 text-sm text-slate-500">
                面向单台设备下发服务调用或属性设置，并查看命令回执。
              </p>
            </div>
            <div className="mt-6">
              <ControlConsolePanel />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

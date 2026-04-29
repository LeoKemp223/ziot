import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { OtaTaskDetailPanel } from "@/components/ota/ota-task-detail-panel";

export const dynamic = "force-dynamic";

type OtaTaskPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function OtaTaskPage({ params }: OtaTaskPageProps) {
  const { taskId } = await params;
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
            <a className="text-sm font-medium text-blue-600" href="/ota">
              返回 OTA 升级
            </a>
            <div className="mt-4">
              <OtaTaskDetailPanel taskId={taskId} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

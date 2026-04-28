import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { InvitationsPanel } from "@/components/identity/invitations-panel";

export const dynamic = "force-dynamic";

export default function InvitationsPage() {
  const items = navItems.map((item) => ({
    ...item,
    active: item.href === "/invitations"
  }));

  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <ConsoleSidebar items={items} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">
                邀请码
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                创建邀请码，并跟踪邀请码状态和使用次数。
              </p>
            </div>
            <div className="mt-6">
              <InvitationsPanel />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

import { Activity, AlertTriangle, Cpu, Database } from "lucide-react";
import type { DashboardStat } from "./dashboard-data";

const statIcons = {
  cpu: Cpu,
  activity: Activity,
  database: Database,
  alert: AlertTriangle
} satisfies Record<DashboardStat["icon"], typeof Cpu>;

const toneClasses = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100"
} satisfies Record<DashboardStat["tone"], string>;

type StatCardProps = {
  stat: DashboardStat;
};

export function StatCard({ stat }: StatCardProps) {
  const Icon = statIcons[stat.icon];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-500">{stat.label}</div>
          <div className="mt-3 text-2xl font-semibold text-slate-950">
            {stat.value}
          </div>
        </div>
        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1",
            toneClasses[stat.tone]
          ].join(" ")}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 truncate text-sm text-slate-500">{stat.change}</div>
    </section>
  );
}

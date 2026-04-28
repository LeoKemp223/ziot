import { AlertCircle, CircleCheck, Clock3 } from "lucide-react";
import {
  alertSummaries,
  dashboardStats,
  navItems,
  recentLogs,
  storageUsage,
  trafficSeries
} from "@/components/console/dashboard-data";
import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { StatCard } from "@/components/console/stat-card";

const logToneClasses = {
  info: "bg-blue-50 text-blue-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600"
};

const alertToneClasses = {
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-200 bg-blue-50 text-blue-700"
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <ConsoleSidebar items={navItems} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-950">
                  控制台概览
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  实时监控平台运行状态、核心指标及设备活动摘要。
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock3 className="h-4 w-4" />
                数据刷新于 10:45
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {dashboardStats.map((stat) => (
                <StatCard key={stat.label} stat={stat} />
              ))}
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">
                      流量数据分析
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      近 12 小时 MQTT 上报量与命令回执趋势
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      上报
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      回执
                    </span>
                  </div>
                </div>
                <div className="mt-7 flex h-72 items-end gap-2 border-b border-l border-slate-200 px-3 pb-3">
                  {trafficSeries.map((value, index) => (
                    <div
                      className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                      key={`${value}-${index}`}
                    >
                      <div className="flex h-56 w-full items-end justify-center gap-1">
                        <div
                          aria-label={`第 ${index + 1} 小时上报量 ${value}`}
                          className="w-full max-w-5 rounded-t bg-blue-500"
                          style={{ height: `${value}%` }}
                        />
                        <div
                          aria-label={`第 ${index + 1} 小时回执量`}
                          className="w-full max-w-5 rounded-t bg-emerald-400"
                          style={{ height: `${Math.max(value - 18, 18)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {index + 1}h
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-950">
                    最近日志
                  </h2>
                  <span className="text-xs text-slate-400">实时</span>
                </div>
                <div className="mt-4 space-y-4">
                  {recentLogs.map((log) => (
                    <div className="flex gap-3" key={`${log.time}-${log.title}`}>
                      <div
                        className={[
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                          logToneClasses[log.level]
                        ].join(" ")}
                      >
                        {log.level === "success" ? (
                          <CircleCheck className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {log.title}
                          </div>
                          <div className="shrink-0 text-xs text-slate-400">
                            {log.time}
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
                          {log.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">
                  核心告警
                </h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {alertSummaries.map((alert) => (
                    <div
                      className={[
                        "rounded-md border p-4",
                        alertToneClasses[alert.tone]
                      ].join(" ")}
                      key={alert.label}
                    >
                      <div className="text-sm font-medium">{alert.label}</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {alert.value}
                      </div>
                      <div className="mt-1 text-xs opacity-80">
                        {alert.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">
                      存储容量
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      系统盘与对象存储用量
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold text-slate-950">
                      {storageUsage.used}
                    </div>
                    <div className="text-slate-400">/ {storageUsage.total}</div>
                  </div>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{ width: `${storageUsage.percent}%` }}
                  />
                </div>
                <div className="mt-4 space-y-3">
                  {storageUsage.segments.map((segment) => (
                    <div
                      className="flex items-center justify-between gap-3 text-sm"
                      key={segment.label}
                    >
                      <div className="flex min-w-0 items-center gap-2 text-slate-600">
                        <span
                          className={[
                            "h-2.5 w-2.5 shrink-0 rounded-full",
                            segment.colorClass
                          ].join(" ")}
                        />
                        <span className="truncate">{segment.label}</span>
                      </div>
                      <span className="shrink-0 text-slate-500">
                        {segment.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

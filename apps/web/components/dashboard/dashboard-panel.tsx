"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { Activity, AlertTriangle, Cpu, Database, RefreshCw, UploadCloud } from "lucide-react";

type DashboardSummary = {
  total_devices: number;
  online_devices: number;
  online_rate: number;
  today_reports: number;
  today_commands: number;
  running_ota_tasks: number;
  recent_errors: Array<{
    id: string;
    type: string;
    level: string;
    device_id: string;
    device_name: string;
    product_name: string;
    content: unknown;
    occurred_at: string;
  }>;
  traffic: Array<{
    label: string;
    reports: number;
    commands: number;
  }>;
  generated_at: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

const statIcons = {
  devices: Cpu,
  online: Activity,
  reports: Database,
  ota: UploadCloud
};

export function DashboardPanel() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/v1/dashboard/summary", {
        cache: "no-store"
      });
      const body = (await response.json()) as ApiResponse<DashboardSummary>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setSummary(body.data);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!summary || !chartRef.current) {
      return undefined;
    }

    const chart = echarts.init(chartRef.current);
    chart.setOption({
      animationDuration: 300,
      color: ["#2563eb", "#10b981"],
      grid: { left: 42, right: 16, top: 32, bottom: 28 },
      tooltip: { trigger: "axis" },
      legend: {
        top: 0,
        right: 0,
        data: ["上报", "命令"],
        textStyle: { color: "#64748b" }
      },
      xAxis: {
        type: "category",
        data: summary.traffic.map((item) => item.label),
        axisLine: { lineStyle: { color: "#cbd5e1" } },
        axisLabel: { color: "#64748b" }
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: "#64748b" },
        splitLine: { lineStyle: { color: "#e2e8f0" } }
      },
      series: [
        {
          name: "上报",
          type: "bar",
          barMaxWidth: 20,
          data: summary.traffic.map((item) => item.reports)
        },
        {
          name: "命令",
          type: "bar",
          barMaxWidth: 20,
          data: summary.traffic.map((item) => item.commands)
        }
      ]
    });

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [summary]);

  if (!summary && loading) {
    return <div className="p-8 text-sm text-slate-500">正在加载概览数据...</div>;
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
        {error || "暂无概览数据。"}
      </div>
    );
  }

  const stats = [
    {
      key: "devices",
      label: "设备总数",
      value: summary.total_devices,
      detail: `${summary.online_devices} 台在线`,
      tone: "blue"
    },
    {
      key: "online",
      label: "在线率",
      value: `${summary.online_rate}%`,
      detail: "按当前在线设备计算",
      tone: "emerald"
    },
    {
      key: "reports",
      label: "今日上报",
      value: summary.today_reports,
      detail: `${summary.today_commands} 条命令`,
      tone: "violet"
    },
    {
      key: "ota",
      label: "OTA 运行中",
      value: summary.running_ota_tasks,
      detail: "正在执行的升级任务",
      tone: "amber"
    }
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          数据刷新于 {formatDateTime(summary.generated_at)}
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
          刷新
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = statIcons[stat.key];

          return (
            <section
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              key={stat.key}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-500">{stat.label}</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">
                    {stat.value}
                  </div>
                </div>
                <div
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-md",
                    stat.tone === "blue"
                      ? "bg-blue-50 text-blue-600"
                      : stat.tone === "emerald"
                        ? "bg-emerald-50 text-emerald-600"
                        : stat.tone === "violet"
                          ? "bg-violet-50 text-violet-600"
                          : "bg-amber-50 text-amber-600"
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-sm text-slate-500">{stat.detail}</div>
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">近 12 小时活动</h2>
              <p className="mt-1 text-sm text-slate-500">
                设备上报与控制命令创建数量
              </p>
            </div>
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                上报
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                命令
              </span>
            </div>
          </div>
          <div className="mt-6 h-72 w-full" ref={chartRef} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">最近错误</h2>
          </div>
          {summary.recent_errors.length === 0 ? (
            <div className="p-8 text-sm text-slate-500">暂无 warn/error 上报。</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.recent_errors.map((item) => (
                <div className="flex gap-3 px-5 py-4" key={item.id}>
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="truncate text-sm font-medium text-slate-950">
                        {item.product_name || "-"} / {item.device_name || item.device_id}
                      </div>
                      <div className="shrink-0 text-xs text-slate-400">
                        {formatShortTime(item.occurred_at)}
                      </div>
                    </div>
                    <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
                      {JSON.stringify(item.content ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

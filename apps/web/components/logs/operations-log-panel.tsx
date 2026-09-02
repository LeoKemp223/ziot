"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes
} from "react";
import { ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination-bar";

type LogKind = "device" | "commands" | "ota";

type LogList = {
  items: Array<Record<string, any>>;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type Filters = {
  product_id: string;
  device_id: string;
  status: string;
  type: string;
  level: string;
  task_id: string;
  keyword: string;
};

const initialFilters: Filters = {
  product_id: "",
  device_id: "",
  status: "",
  type: "",
  level: "",
  task_id: "",
  keyword: ""
};

const tabs: Array<{ key: LogKind; label: string }> = [
  { key: "device", label: "设备上报" },
  { key: "commands", label: "命令记录" },
  { key: "ota", label: "OTA 记录" }
];

export function OperationsLogPanel() {
  const [kind, setKind] = useState<LogKind>("device");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [logs, setLogs] = useState<Array<Record<string, any>>>([]);
  const [pagination, setPagination] = useState<LogList["pagination"]>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(page = pagination.page, nextKind = kind, nextFilters = filters) {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pagination.page_size)
    });
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    }

    try {
      const response = await fetch(`/api/v1/logs/${nextKind}?${params.toString()}`, {
        cache: "no-store"
      });
      const body = (await response.json()) as ApiResponse<LogList>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setLogs(body.data.items);
      setPagination(body.data.pagination);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  function switchKind(nextKind: LogKind) {
    setKind(nextKind);
    setFilters(initialFilters);
    void load(1, nextKind, initialFilters);
  }

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1);
  }

  useEffect(() => {
    void load(1, "device", initialFilters);
  }, []);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-4">
        {tabs.map((tab) => (
          <button
            className={[
              "h-9 rounded-md px-3 text-sm font-medium",
              kind === tab.key
                ? "bg-slate-950 text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            ].join(" ")}
            key={tab.key}
            onClick={() => switchKind(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <form
        className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
        onSubmit={submit}
      >
        <Input
          onChange={(event) => updateFilter("product_id", event.currentTarget.value)}
          placeholder="product_id"
          value={filters.product_id}
        />
        <Input
          onChange={(event) => updateFilter("device_id", event.currentTarget.value)}
          placeholder="device_id"
          value={filters.device_id}
        />
        {kind === "device" ? (
          <>
            <Input
              onChange={(event) => updateFilter("type", event.currentTarget.value)}
              placeholder="type: property/event/log"
              value={filters.type}
            />
            <Input
              onChange={(event) => updateFilter("level", event.currentTarget.value)}
              placeholder="level: info/warn/error"
              value={filters.level}
            />
          </>
        ) : (
          <Input
            onChange={(event) => updateFilter("status", event.currentTarget.value)}
            placeholder="status"
            value={filters.status}
          />
        )}
        {kind === "ota" ? (
          <Input
            onChange={(event) => updateFilter("task_id", event.currentTarget.value)}
            placeholder="task_id"
            value={filters.task_id}
          />
        ) : null}
        <Input
          onChange={(event) => updateFilter("keyword", event.currentTarget.value)}
          placeholder="keyword"
          value={filters.keyword}
        />
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          <Search className="h-4 w-4" />
          查询
        </button>
      </form>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="text-sm text-slate-500">共 {pagination.total} 条记录</div>
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
          刷新
        </button>
      </div>
      {error ? (
        <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
          {error}
        </div>
      ) : null}
      <LogTable kind={kind} loading={loading} logs={logs} />
      <PaginationBar
        disabled={loading}
        onPageChange={(page) => void load(page)}
        pagination={pagination}
      />
    </section>
  );
}

function LogTable({
  kind,
  loading,
  logs
}: {
  kind: LogKind;
  loading: boolean;
  logs: Array<Record<string, any>>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  if (logs.length === 0) {
    return (
      <div className="border-t border-slate-100 p-8 text-sm text-slate-500">
        {loading ? "正在加载日志..." : "暂无日志。"}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-slate-100">
      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className="px-5 py-3">时间</th>
            <th className="px-4 py-3">设备</th>
            <th className="px-4 py-3">类型/状态</th>
            <th className="px-5 py-3">内容</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {logs.map((log) => (
            <tr className="align-top hover:bg-slate-50" key={String(log.id)}>
              <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                {formatDateTime(
                  String(log.occurred_at ?? log.created_at ?? log.updated_at)
                )}
              </td>
              <td className="px-4 py-4">
                <div className="font-medium text-slate-950">
                  {String(log.device_name || log.device_key || log.device_id)}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-400">
                  {String(log.product_key || log.product_id)}
                </div>
              </td>
              <td className="px-4 py-4">
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                  {kind === "device"
                    ? `${String(log.type)} / ${String(log.level)}`
                    : String(log.status)}
                </span>
              </td>
              <td className="px-5 py-4">
                <button
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
                  onClick={() => toggleExpanded(String(log.id))}
                  type="button"
                >
                  {expandedIds.has(String(log.id)) ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {expandedIds.has(String(log.id)) ? "收起" : "展开"}
                </button>
                {expandedIds.has(String(log.id)) ? (
                  <pre className="mt-2 max-h-36 max-w-[560px] overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
                    {JSON.stringify(logContent(kind, log), null, 2)}
                  </pre>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function logContent(kind: LogKind, log: Record<string, any>) {
  if (kind === "device") {
    return log.content;
  }

  if (kind === "commands") {
    return {
      identifier: log.identifier,
      request_id: log.request_id,
      params: log.params,
      result: log.result,
      error_message: log.error_message
    };
  }

  return {
    task_id: log.task_id,
    task_name: log.task_name,
    firmware_version: log.firmware_version,
    progress: log.progress,
    error_message: log.error_message
  };
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      {...props}
    />
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

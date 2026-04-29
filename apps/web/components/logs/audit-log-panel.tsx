"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes
} from "react";
import { RefreshCw, Search } from "lucide-react";

type AuditLog = {
  id: string;
  user_id: string;
  user_account: string;
  user_display_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip: string;
  user_agent: string | null;
  detail: unknown;
  created_at: string;
};

type AuditLogList = {
  items: AuditLog[];
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
  action: string;
  resource_type: string;
  resource_id: string;
  user_id: string;
  ip: string;
};

const initialFilters: Filters = {
  action: "",
  resource_type: "",
  resource_id: "",
  user_id: "",
  ip: ""
};

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditLogList["pagination"]>({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1
  });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(page = pagination.page, nextFilters = filters) {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pagination.page_size)
    });
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    });

    try {
      const response = await fetch(`/api/v1/audit-logs?${params.toString()}`, {
        cache: "no-store"
      });
      const body = (await response.json()) as ApiResponse<AuditLogList>;

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

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1, filters);
  }

  function resetFilters() {
    setFilters(initialFilters);
    void load(1, initialFilters);
  }

  useEffect(() => {
    void load(1, initialFilters);
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <form
          className="grid gap-3 border-b border-slate-200 p-5 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto]"
          onSubmit={submitFilters}
        >
          <Input
            onChange={(event) => updateFilter("action", event.currentTarget.value)}
            placeholder="action"
            value={filters.action}
          />
          <Input
            onChange={(event) =>
              updateFilter("resource_type", event.currentTarget.value)
            }
            placeholder="resource_type"
            value={filters.resource_type}
          />
          <Input
            onChange={(event) =>
              updateFilter("resource_id", event.currentTarget.value)
            }
            placeholder="resource_id"
            value={filters.resource_id}
          />
          <Input
            onChange={(event) => updateFilter("user_id", event.currentTarget.value)}
            placeholder="user_id"
            value={filters.user_id}
          />
          <Input
            onChange={(event) => updateFilter("ip", event.currentTarget.value)}
            placeholder="ip"
            value={filters.ip}
          />
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            <Search className="h-4 w-4" />
            查询
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={resetFilters}
            type="button"
          >
            重置
          </button>
        </form>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="text-sm text-slate-500">
            共 {pagination.total} 条审计日志
          </div>
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
        {logs.length === 0 ? (
          <div className="border-t border-slate-100 p-8 text-sm text-slate-500">
            {loading ? "正在加载审计日志..." : "暂无审计日志。"}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">时间</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">动作</th>
                  <th className="px-4 py-3">资源</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-5 py-3">详情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr className="align-top hover:bg-slate-50" key={log.id}>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-950">
                        {log.user_display_name || log.user_account || log.user_id}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-400">
                        {log.user_id}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs text-slate-700">
                        {log.resource_type}
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-slate-400">
                        {log.resource_id}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-600">
                      {log.ip}
                    </td>
                    <td className="px-5 py-4">
                      <pre className="max-h-32 max-w-[360px] overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
                        {JSON.stringify(log.detail ?? {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            className="h-8 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading || pagination.page <= 1}
            onClick={() => void load(pagination.page - 1)}
            type="button"
          >
            上一页
          </button>
          <span className="text-sm text-slate-500">
            {pagination.page} / {pagination.total_pages}
          </span>
          <button
            className="h-8 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading || pagination.page >= pagination.total_pages}
            onClick={() => void load(pagination.page + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  );
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

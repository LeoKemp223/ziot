"use client";

import { useEffect, useRef, useState } from "react";
import { PaginationBar, type ListPagination } from "@/components/ui/pagination-bar";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

type DeviceRecord =
  | {
      id: string;
      source: "command";
      time: string;
      identifier: string;
      request_id: string;
      status: string;
      params: unknown;
      result: unknown;
      error_message: string | null;
    }
  | {
      id: string;
      source: "report";
      time: string;
      type: string;
      level: string;
      content: unknown;
    };

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type RecordsResponse = ApiResponse<{
  items: DeviceRecord[];
  pagination: ListPagination;
}>;

const PAGE_SIZE = 10;

const DEFAULT_PAGINATION: ListPagination = {
  page: 1,
  page_size: PAGE_SIZE,
  total: 0,
  total_pages: 1
};

export function DeviceRecordsSection({
  deviceId,
  pollIntervalMs = 0,
  refreshKey = 0
}: {
  deviceId: string;
  pollIntervalMs?: number;
  refreshKey?: number;
}) {
  const [records, setRecords] = useState<DeviceRecord[]>([]);
  const [pagination, setPagination] = useState<ListPagination>(DEFAULT_PAGINATION);
  const [error, setError] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const pageRef = useRef(1);
  const epochRef = useRef(0);

  async function loadRecords(page: number) {
    pageRef.current = page;

    if (!deviceId) {
      setRecords([]);
      setPagination(DEFAULT_PAGINATION);
      setError("");
      return;
    }

    const epoch = epochRef.current;

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE)
      });
      const response = await fetch(
        `/api/v1/devices/${deviceId}/records?${params.toString()}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as RecordsResponse;

      if (epoch !== epochRef.current) {
        return;
      }

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setRecords(body.data.items);
      setPagination(body.data.pagination);
    } catch {
      if (epoch === epochRef.current) {
        setError("加载设备记录失败。");
      }
    }
  }

  useEffect(() => {
    epochRef.current += 1;
    pageRef.current = 1;
    setExpandedIds(new Set());
    void loadRecords(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, refreshKey]);

  useEffect(() => {
    if (!deviceId || pollIntervalMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadRecords(pageRef.current);
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, pollIntervalMs]);

  function toggleExpanded(recordId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }

  function refresh() {
    setRefreshing(true);
    void loadRecords(pageRef.current).finally(() => setRefreshing(false));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">设备记录</h2>
          <p className="mt-1 text-sm text-slate-500">
            命令下发与设备上报的统一记录，按时间倒序排列。
          </p>
        </div>
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          disabled={!deviceId}
          onClick={refresh}
          type="button"
        >
          <RefreshCw
            className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(" ")}
          />
          刷新
        </button>
      </div>
      {!deviceId ? (
        <div className="p-8 text-sm text-slate-500">请先选择设备。</div>
      ) : records.length === 0 ? (
        <div className="p-8 text-sm text-slate-500">
          {error || "暂无设备记录。"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-3">时间</th>
                <th className="px-4 py-3">方向</th>
                <th className="px-4 py-3">标识</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-5 py-3">内容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => {
                const expanded = expandedIds.has(record.id);

                return (
                  <tr className="align-top hover:bg-slate-50" key={record.id}>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(record.time)}
                    </td>
                    <td className="px-4 py-4">
                      <DirectionBadge source={record.source} />
                    </td>
                    <td className="px-4 py-4">
                      {record.source === "command" ? (
                        <>
                          <div className="font-medium text-slate-950">
                            {record.identifier}
                          </div>
                          <div className="mt-1 font-mono text-xs text-slate-400">
                            {record.request_id}
                          </div>
                        </>
                      ) : (
                        <ReportTypeBadge value={record.type} />
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {record.source === "command" ? (
                        <>
                          <CommandStatusBadge value={record.status} />
                          {record.error_message ? (
                            <div className="mt-1 max-w-[220px] text-xs text-rose-600">
                              {record.error_message}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <LogLevelBadge value={record.level} />
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <RecordContent
                        expanded={expanded}
                        onToggle={() => toggleExpanded(record.id)}
                        record={record}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar
        disabled={!deviceId}
        onPageChange={(page) => void loadRecords(page)}
        pagination={pagination}
      />
    </section>
  );
}

function RecordContent({
  record,
  expanded,
  onToggle
}: {
  record: DeviceRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const value = record.source === "command" ? record.params : record.content;
  const summary = JSON.stringify(value) ?? String(value);

  return (
    <div>
      <button
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
        onClick={onToggle}
        type="button"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {expanded ? "收起" : "展开"}
      </button>
      {expanded ? (
        record.source === "command" ? (
          <div className="mt-2 space-y-2">
            <JsonBlock label="参数" value={record.params} />
            {record.result !== null && record.result !== undefined ? (
              <JsonBlock label="结果" value={record.result} />
            ) : null}
          </div>
        ) : (
          <div className="mt-2">
            <JsonBlock value={record.content} />
          </div>
        )
      ) : (
        <div className="mt-1 max-w-[260px] truncate font-mono text-xs text-slate-500">
          {summary}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label?: string; value: unknown }) {
  return (
    <div>
      {label ? <div className="text-xs text-slate-400">{label}</div> : null}
      <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function DirectionBadge({ source }: { source: DeviceRecord["source"] }) {
  const meta =
    source === "command"
      ? { label: "下发", className: "bg-indigo-50 text-indigo-700" }
      : { label: "上报", className: "bg-emerald-50 text-emerald-700" };

  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-medium",
        meta.className
      ].join(" ")}
    >
      {meta.label}
    </span>
  );
}

function CommandStatusBadge({ value }: { value: string }) {
  const meta =
    value === "success"
      ? { label: "成功", className: "bg-emerald-50 text-emerald-700" }
      : value === "failed"
        ? { label: "失败", className: "bg-rose-50 text-rose-700" }
        : value === "timeout"
          ? { label: "超时", className: "bg-amber-50 text-amber-700" }
          : value === "sent"
            ? { label: "已发送", className: "bg-blue-50 text-blue-700" }
            : { label: value, className: "bg-slate-100 text-slate-600" };

  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-medium",
        meta.className
      ].join(" ")}
    >
      {meta.label}
    </span>
  );
}

function ReportTypeBadge({ value }: { value: string }) {
  const meta =
    value === "property"
      ? { label: "属性", className: "bg-emerald-50 text-emerald-700" }
      : value === "event"
        ? { label: "事件", className: "bg-blue-50 text-blue-700" }
        : { label: "日志", className: "bg-amber-50 text-amber-700" };

  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-medium",
        meta.className
      ].join(" ")}
    >
      {meta.label}
    </span>
  );
}

function LogLevelBadge({ value }: { value: string }) {
  const meta =
    value === "error"
      ? { label: "error", className: "bg-rose-50 text-rose-700" }
      : value === "warn"
        ? { label: "warn", className: "bg-amber-50 text-amber-700" }
        : value === "debug"
          ? { label: "debug", className: "bg-slate-100 text-slate-600" }
          : { label: "info", className: "bg-blue-50 text-blue-700" };

  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-medium",
        meta.className
      ].join(" ")}
    >
      {meta.label}
    </span>
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

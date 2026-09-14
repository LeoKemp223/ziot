"use client";

import { useEffect, useState } from "react";
import { Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { PaginationBar, type ListPagination } from "@/components/ui/pagination-bar";
import { RecordStatusBadge, TaskStatusBadge } from "@/components/ota/ota-status";
import { usePermissions } from "@/components/console/use-permissions";

type OtaTask = {
  id: string;
  name: string;
  product_name: string;
  firmware_version: string;
  status: string;
  record_counts: Record<string, number>;
};

type OtaRecord = {
  id: string;
  device_name: string;
  device_key: string;
  status: string;
  progress: number;
  error_message: string | null;
  updated_at: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export function OtaTaskDetailPanel({ taskId }: { taskId: string }) {
  const { isLoaded, hasPermission } = usePermissions();
  const canExecuteOta = isLoaded && hasPermission("ota:execute");
  const [task, setTask] = useState<OtaTask | null>(null);
  const [records, setRecords] = useState<OtaRecord[]>([]);
  const [pagination, setPagination] = useState<ListPagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(page = pagination.page, silent = false) {
    // 轮询走 silent,不闪全屏 loading/禁用分页
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pagination.page_size)
      });
      const [taskResponse, recordsResponse] = await Promise.all([
        fetch(`/api/v1/ota/tasks/${taskId}`),
        fetch(`/api/v1/ota/tasks/${taskId}/records?${params.toString()}`)
      ]);
      const taskBody = (await taskResponse.json()) as ApiResponse<OtaTask>;
      const recordsBody = (await recordsResponse.json()) as ApiResponse<{
        items: OtaRecord[];
        pagination: ListPagination;
      }>;

      if (!taskResponse.ok || taskBody.code !== 0 || !taskBody.data) {
        setError(taskBody.message);
        return;
      }

      if (!recordsResponse.ok || recordsBody.code !== 0 || !recordsBody.data) {
        setError(recordsBody.message);
        return;
      }

      setTask(taskBody.data);
      setRecords(recordsBody.data.items);
      setPagination(recordsBody.data.pagination);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  async function cancelTask() {
    setStopping(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/v1/ota/tasks/${taskId}/cancel`, {
        method: "POST"
      });
      const body = (await response.json()) as ApiResponse<OtaTask>;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        return;
      }

      setMessage("任务已取消，未完成的设备记录已一并取消。");
      await load();
    } catch {
      setError("取消任务失败，请稍后重试。");
    } finally {
      setStopping(false);
    }
  }

  async function startTask() {
    setStarting(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/v1/ota/tasks/${taskId}/start`, {
        method: "POST"
      });
      const body = (await response.json()) as ApiResponse<OtaTask>;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        return;
      }

      setMessage("任务已启动，未成功的设备已重新下发升级通知。");
      await load();
    } catch {
      setError("启动任务失败，请稍后重试。");
    } finally {
      setStarting(false);
    }
  }

  async function deleteTask() {
    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/v1/ota/tasks/${taskId}`, {
        method: "DELETE"
      });
      const body = (await response.json()) as ApiResponse<OtaTask>;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        setDeleting(false);
        return;
      }

      window.location.href = "/ota";
    } catch {
      setError("删除任务失败，请稍后重试。");
      setDeleting(false);
    }
  }

  useEffect(() => {
    void load();
  }, [taskId]);

  // 任务进行中每 5s 静默轮询结果;进入终态(完成/取消)后停止
  const isTaskActive = task !== null && !["finished", "cancelled"].includes(task.status);

  useEffect(() => {
    if (!isTaskActive) {
      return;
    }

    const timer = window.setInterval(() => {
      void load(pagination.page, true);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isTaskActive, taskId, pagination.page]);

  if (loading && !task) {
    return <div className="p-8 text-sm text-slate-500">正在加载 OTA 任务...</div>;
  }

  if (!task) {
    return <div className="p-8 text-sm text-rose-600">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">{task.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              {task.product_name} / {task.firmware_version}
              <TaskStatusBadge value={task.status} />
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!["finished", "cancelled"].includes(task.status) ? (
              <>
                {canExecuteOta && ["created", "scheduled"].includes(task.status) ? (
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={starting}
                    onClick={() => void startTask()}
                    type="button"
                  >
                    <Play className="h-4 w-4" />
                    {starting ? "启动中..." : "启动任务"}
                  </button>
                ) : null}
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={stopping}
                  onClick={() => void cancelTask()}
                  type="button"
                >
                  <Square className="h-4 w-4" />
                  {stopping ? "取消中..." : "取消任务"}
                </button>
              </>
            ) : (
              <>
                {canExecuteOta && (task.record_counts.success ?? 0) < (task.record_counts.total ?? 0) ? (
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={starting}
                    onClick={() => void startTask()}
                    type="button"
                  >
                    <Play className="h-4 w-4" />
                    {starting ? "启动中..." : "重新启动"}
                  </button>
                ) : null}
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deleting}
                  onClick={() => void deleteTask()}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "删除中..." : "删除任务"}
                </button>
              </>
            )}
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-4">
          {(
            [
              ["total", "设备总数"],
              ["success", "升级成功"],
              ["failed", "升级失败"],
              ["cancelled", "已取消"]
            ] as const
          ).map(([key, label]) => (
            <div className="rounded-md border border-slate-200 p-4" key={key}>
              <div className="text-xs font-medium text-slate-400">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">
                {task.record_counts[key] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">设备升级记录</h2>
          {message ? (
            <p className="mt-1 text-sm text-emerald-600">{message}</p>
          ) : null}
          {error ? <p className="mt-1 text-sm text-rose-600">{error}</p> : null}
        </div>
        {records.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">暂无升级记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">设备</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">进度</th>
                  <th className="px-4 py-3">错误</th>
                  <th className="px-5 py-3">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr className="hover:bg-slate-50" key={record.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-950">
                        {record.device_name}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-400">
                        {record.device_key}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <RecordStatusBadge value={record.status} />
                    </td>
                    <td className="px-4 py-4">{record.progress}%</td>
                    <td className="px-4 py-4 text-rose-600">
                      {record.error_message ?? "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {formatDateTime(record.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          disabled={loading}
          onPageChange={(page) => void load(page)}
          pagination={pagination}
        />
      </section>
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

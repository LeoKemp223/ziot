"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

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
  const [task, setTask] = useState<OtaTask | null>(null);
  const [records, setRecords] = useState<OtaRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [taskResponse, recordsResponse] = await Promise.all([
        fetch(`/api/v1/ota/tasks/${taskId}`),
        fetch(`/api/v1/ota/tasks/${taskId}/records`)
      ]);
      const taskBody = (await taskResponse.json()) as ApiResponse<OtaTask>;
      const recordsBody = (await recordsResponse.json()) as ApiResponse<OtaRecord[]>;

      if (!taskResponse.ok || taskBody.code !== 0 || !taskBody.data) {
        setError(taskBody.message);
        return;
      }

      if (!recordsResponse.ok || recordsBody.code !== 0 || !recordsBody.data) {
        setError(recordsBody.message);
        return;
      }

      setTask(taskBody.data);
      setRecords(recordsBody.data);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [taskId]);

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
            <p className="mt-1 text-sm text-slate-500">
              {task.product_name} / {task.firmware_version} / {task.status}
            </p>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-4">
          {["total", "success", "failed", "cancelled"].map((key) => (
            <div className="rounded-md border border-slate-200 p-4" key={key}>
              <div className="text-xs font-medium text-slate-400">{key}</div>
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
                    <td className="px-4 py-4">{record.status}</td>
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

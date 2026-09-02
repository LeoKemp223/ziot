"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, RefreshCw, Save } from "lucide-react";
import { usePermissions } from "@/components/console/use-permissions";

type DeviceItem = {
  id: string;
  product_name: string;
  product_key: string;
  device_key: string;
  device_secret?: string;
  name: string;
  status: string;
  online_status: string;
  firmware_version: string | null;
  tags: Record<string, unknown>;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

type DeviceShadow = {
  device_id: string;
  reported: unknown;
  desired: unknown;
  version: number;
  updated_at: string;
};

type DeviceTopic = {
  key: string;
  name: string;
  direction: string;
  operation: string;
  topic: string;
  description: string;
};

type DeviceCommand = {
  id: string;
  identifier: string;
  params: unknown;
  status: string;
  request_id: string;
  result: unknown;
  error_code: string | null;
  error_message: string | null;
  timeout_at: string;
  sent_at: string | null;
  replied_at: string | null;
  created_at: string;
};

type DeviceReport = {
  id: string;
  device_id: string;
  type: string;
  level: string;
  content: unknown;
  occurred_at: string;
  created_at: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

type CommandsResponse = ApiResponse<{
  items: DeviceCommand[];
  pagination: Pagination;
}>;

type DeviceDetailPanelProps = {
  deviceId: string;
};

export function DeviceDetailPanel({ deviceId }: DeviceDetailPanelProps) {
  const { isLoaded, hasPermission } = usePermissions();
  const canWriteDevices = isLoaded && hasPermission("device:write");
  const canControlDevices = isLoaded && hasPermission("device:control");
  const [device, setDevice] = useState<DeviceItem | null>(null);
  const [shadow, setShadow] = useState<DeviceShadow | null>(null);
  const [topics, setTopics] = useState<DeviceTopic[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [commandPagination, setCommandPagination] = useState<Pagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [reports, setReports] = useState<DeviceReport[]>([]);
  const [desiredText, setDesiredText] = useState("{}");
  const [commandKind, setCommandKind] = useState<"property_set" | "service">(
    "service"
  );
  const [commandIdentifier, setCommandIdentifier] = useState("setSwitch");
  const [commandParamsText, setCommandParamsText] = useState("{}");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const commandPageRef = useRef(1);

  async function loadDevice(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }
    setError("");

    try {
      const [
        deviceResponse,
        shadowResponse,
        topicsResponse,
        reportsResponse
      ] = await Promise.all([
        fetch(`/api/v1/devices/${deviceId}`),
        fetch(`/api/v1/devices/${deviceId}/shadow`),
        fetch(`/api/v1/devices/${deviceId}/topics`),
        fetch(`/api/v1/devices/${deviceId}/reports`)
      ]);
      const deviceBody = (await deviceResponse.json()) as ApiResponse<DeviceItem>;
      const shadowBody = (await shadowResponse.json()) as ApiResponse<DeviceShadow>;
      const topicsBody = (await topicsResponse.json()) as ApiResponse<DeviceTopic[]>;
      const reportsBody = (await reportsResponse.json()) as ApiResponse<
        DeviceReport[]
      >;

      if (!deviceResponse.ok || deviceBody.code !== 0 || !deviceBody.data) {
        setError(deviceBody.message);
        return;
      }

      if (!shadowResponse.ok || shadowBody.code !== 0 || !shadowBody.data) {
        setError(shadowBody.message);
        return;
      }

      if (!topicsResponse.ok || topicsBody.code !== 0 || !topicsBody.data) {
        setError(topicsBody.message);
        return;
      }

      if (!reportsResponse.ok || reportsBody.code !== 0 || !reportsBody.data) {
        setError(reportsBody.message);
        return;
      }

      setDevice(deviceBody.data);
      setShadow(shadowBody.data);
      setTopics(topicsBody.data);
      setReports(reportsBody.data);
      setDesiredText(JSON.stringify(shadowBody.data.desired, null, 2));
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  async function loadCommands(page = commandPageRef.current) {
    commandPageRef.current = page;

    const params = new URLSearchParams({
      page: String(page),
      page_size: String(commandPagination.page_size)
    });

    try {
      const response = await fetch(
        `/api/v1/devices/${deviceId}/commands?${params.toString()}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as CommandsResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setCommands(body.data.items);
      setCommandPagination(body.data.pagination);
    } catch {
      setError("加载命令记录失败。");
    }
  }

  async function sendCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const params = JSON.parse(commandParamsText) as unknown;
      const response = await fetch(`/api/v1/devices/${deviceId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: commandKind,
          ...(commandKind === "service" ? { identifier: commandIdentifier } : {}),
          params,
          timeout_ms: 15000
        })
      });
      const body = (await response.json()) as ApiResponse<DeviceCommand>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      await loadCommands(1);
      setMessage("控制指令已下发。");
    } catch (sendError) {
      setError(
        sendError instanceof SyntaxError
          ? "控制参数 JSON 格式不正确。"
          : "控制指令下发失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const form = new FormData(event.currentTarget);

    try {
      const tagsText = String(form.get("tags") ?? "{}");
      const tags = JSON.parse(tagsText) as unknown;
      const response = await fetch(`/api/v1/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          status: String(form.get("status") ?? ""),
          firmware_version: String(form.get("firmware_version") ?? "") || null,
          tags
        })
      });
      const body = (await response.json()) as ApiResponse<DeviceItem>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setDevice(body.data);
      setMessage("设备信息已保存。");
    } catch (saveError) {
      setError(
        saveError instanceof SyntaxError
          ? "标签 JSON 格式不正确。"
          : "保存设备失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveDesired(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const desired = JSON.parse(desiredText) as unknown;
      const response = await fetch(`/api/v1/devices/${deviceId}/shadow`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ desired })
      });
      const body = (await response.json()) as ApiResponse<DeviceShadow>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setShadow(body.data);
      setDesiredText(JSON.stringify(body.data.desired, null, 2));
      setMessage("期望状态已保存。");
    } catch (saveError) {
      setError(
        saveError instanceof SyntaxError
          ? "期望状态 JSON 格式不正确。"
          : "保存设备影子失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetSecret() {
    if (!window.confirm("确认重置设备密钥？旧密钥将立即失效。")) {
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");
    setSecret("");

    try {
      const response = await fetch(`/api/v1/devices/${deviceId}/secret`, {
        method: "POST"
      });
      const body = (await response.json()) as ApiResponse<DeviceItem>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setDevice(body.data);
      setSecret(body.data.device_secret ?? "");
      setMessage("设备密钥已重置。");
    } catch {
      setError("重置设备密钥失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    commandPageRef.current = 1;
    void loadDevice();
    void loadCommands(1);

    const timer = window.setInterval(() => {
      void loadDevice(false);
      void loadCommands();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [deviceId]);

  if (loading && !device) {
    return <div className="p-8 text-sm text-slate-500">正在加载设备...</div>;
  }

  if (!device) {
    return <div className="p-8 text-sm text-amber-700">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">基础信息</h2>
            <p className="mt-1 text-sm text-slate-500">
              {device.product_name} / {device.device_key}
            </p>
          </div>
          {canWriteDevices ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              disabled={saving}
              onClick={() => void resetSecret()}
              type="button"
            >
              <KeyRound className="h-4 w-4" />
              重置密钥
            </button>
          ) : null}
        </div>
        <form className="grid gap-4 px-5 py-5 md:grid-cols-2" onSubmit={saveDevice}>
          <Field label="设备名称">
            <input
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              defaultValue={device.name}
              maxLength={128}
              name="name"
              required
            />
          </Field>
          <Field label="启用状态">
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              defaultValue={device.status}
              name="status"
            >
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
            </select>
          </Field>
          <Info label="产品标识" value={device.product_key} mono />
          <Info label="设备标识" value={device.device_key} mono />
          <div>
            <div className="text-xs font-medium text-slate-400">在线状态</div>
            <div className="mt-1">
              <OnlineStatusBadge value={device.online_status} />
            </div>
          </div>
          <Info
            label="最后心跳"
            value={
              device.last_heartbeat_at
                ? formatDateTime(device.last_heartbeat_at)
                : "-"
            }
          />
          <Field label="固件版本">
            <input
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              defaultValue={device.firmware_version ?? ""}
              name="firmware_version"
              placeholder="v1.0.0"
            />
          </Field>
          <Field label="标签 JSON">
            <input
              className="h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              defaultValue={JSON.stringify(device.tags ?? {})}
              name="tags"
            />
          </Field>
          <div className="md:col-span-2">
            {secret ? (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs font-medium text-emerald-700">
                  新设备密钥
                </div>
                <div className="mt-1 break-all font-mono text-sm text-emerald-900">
                  {secret}
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              {canWriteDevices ? (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  保存
                </button>
              ) : null}
              {message ? <span className="text-sm text-emerald-600">{message}</span> : null}
              {error ? <span className="text-sm text-rose-600">{error}</span> : null}
            </div>
          </div>
        </form>
      </section>

      {canControlDevices ? (
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <form onSubmit={sendCommand}>
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                控制下发
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                向当前设备下发属性设置或服务调用指令。
              </p>
            </div>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              下发
            </button>
          </div>
          <div className="grid gap-4 px-5 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
              <Field label="类型">
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  onChange={(event) =>
                    setCommandKind(
                      event.currentTarget.value === "property_set"
                        ? "property_set"
                        : "service"
                    )
                  }
                  value={commandKind}
                >
                  <option value="service">控制下发 / 服务调用</option>
                  <option value="property_set">属性设置下发</option>
                </select>
              </Field>
              {commandKind === "service" ? (
                <Field label="服务标识">
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    onChange={(event) =>
                      setCommandIdentifier(event.currentTarget.value)
                    }
                    placeholder="setSwitch"
                    value={commandIdentifier}
                  />
                </Field>
              ) : null}
            </div>
            <Field label="参数 JSON">
              <textarea
                className="min-h-[156px] w-full rounded-md border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setCommandParamsText(event.currentTarget.value)}
                spellCheck={false}
                value={commandParamsText}
              />
            </Field>
          </div>
        </form>
      </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">命令记录</h2>
          <p className="mt-1 text-sm text-slate-500">
            控制指令及设备回执状态。
          </p>
        </div>
        {commands.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">暂无命令记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">指令</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">参数</th>
                  <th className="px-4 py-3">结果</th>
                  <th className="px-5 py-3">创建时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commands.map((command) => (
                  <tr className="align-top hover:bg-slate-50" key={command.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-950">
                        {command.identifier}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-400">
                        {command.request_id}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <CommandStatusBadge value={command.status} />
                      {command.error_message ? (
                        <div className="mt-1 max-w-[220px] text-xs text-rose-600">
                          {command.error_message}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <pre className="max-h-28 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
                        {JSON.stringify(command.params, null, 2)}
                      </pre>
                    </td>
                    <td className="px-4 py-4">
                      <pre className="max-h-28 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
                        {JSON.stringify(command.result ?? {}, null, 2)}
                      </pre>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(command.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          disabled={false}
          onPageChange={(page) => void loadCommands(page)}
          pagination={commandPagination}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">上报记录</h2>
          <p className="mt-1 text-sm text-slate-500">
            最近 20 条属性、事件和日志上报。
          </p>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">暂无上报记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">类型</th>
                  <th className="px-4 py-3">级别</th>
                  <th className="px-4 py-3">内容</th>
                  <th className="px-5 py-3">上报时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((report) => (
                  <tr className="align-top hover:bg-slate-50" key={report.id}>
                    <td className="px-5 py-4">
                      <ReportTypeBadge value={report.type} />
                    </td>
                    <td className="px-4 py-4">
                      <LogLevelBadge value={report.level} />
                    </td>
                    <td className="px-4 py-4">
                      <pre className="max-h-32 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
                        {JSON.stringify(report.content, null, 2)}
                      </pre>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(report.occurred_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Topic 列表</h2>
          <p className="mt-1 text-sm text-slate-500">
            设备可发布或订阅的内置 MQTT Topic。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-3">名称</th>
                <th className="px-4 py-3">方向</th>
                <th className="px-4 py-3">权限</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-5 py-3">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topics.map((topic) => (
                <tr className="align-top hover:bg-slate-50" key={topic.key}>
                  <td className="px-5 py-4 font-medium text-slate-950">
                    {topic.name}
                  </td>
                  <td className="px-4 py-4">
                    <TopicBadge value={topic.direction} />
                  </td>
                  <td className="px-4 py-4">
                    <OperationBadge value={topic.operation} />
                  </td>
                  <td className="px-4 py-4">
                    <code className="break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                      {topic.topic}
                    </code>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {topic.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <form onSubmit={saveDesired}>
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">设备影子</h2>
              <p className="mt-1 text-sm text-slate-500">
                版本 {shadow?.version ?? "-"} / 更新时间{" "}
                {shadow ? formatDateTime(shadow.updated_at) : "-"}
              </p>
            </div>
            {canWriteDevices ? (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存期望状态
              </button>
            ) : null}
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-medium text-slate-400">
                reported
              </div>
              <pre className="min-h-[320px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-700">
                {JSON.stringify(shadow?.reported ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-slate-400">
                desired
              </div>
              <textarea
                className="min-h-[320px] w-full rounded-md border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setDesiredText(event.currentTarget.value)}
                spellCheck={false}
                value={desiredText}
              />
            </div>
          </div>
        </form>
      </section>
    </div>
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

function TopicBadge({ value }: { value: string }) {
  const label = value === "cloud_to_device" ? "平台到设备" : "设备到平台";
  const className =
    value === "cloud_to_device"
      ? "bg-indigo-50 text-indigo-700"
      : "bg-emerald-50 text-emerald-700";

  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-medium",
        className
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function OperationBadge({ value }: { value: string }) {
  const label = value === "subscribe" ? "订阅" : "发布";
  const className =
    value === "subscribe"
      ? "bg-blue-50 text-blue-700"
      : "bg-amber-50 text-amber-700";

  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-medium",
        className
      ].join(" ")}
    >
      {label}
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

function PaginationBar({
  disabled,
  onPageChange,
  pagination
}: {
  disabled: boolean;
  onPageChange: (page: number) => void;
  pagination: Pagination;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
      <div className="text-sm text-slate-500">
        第 {pagination.page} / {pagination.total_pages} 页，共{" "}
        {pagination.total} 条
      </div>
      <div className="flex items-center gap-2">
        <button
          className="h-8 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          disabled={disabled || pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          type="button"
        >
          上一页
        </button>
        <button
          className="h-8 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          disabled={disabled || pagination.page >= pagination.total_pages}
          onClick={() => onPageChange(pagination.page + 1)}
          type="button"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Info({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div
        className={[
          "mt-1 truncate text-sm text-slate-900",
          mono ? "font-mono" : "font-medium"
        ].join(" ")}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function OnlineStatusBadge({ value }: { value: string }) {
  const meta = onlineStatusMeta(value);

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        meta.className
      ].join(" ")}
    >
      <span className={["h-1.5 w-1.5 rounded-full", meta.dotClassName].join(" ")} />
      {meta.label}
    </span>
  );
}

function onlineStatusMeta(value: string) {
  if (value === "online") {
    return {
      label: "在线",
      className: "bg-emerald-50 text-emerald-700",
      dotClassName: "bg-emerald-500"
    };
  }

  if (value === "offline") {
    return {
      label: "离线",
      className: "bg-slate-100 text-slate-600",
      dotClassName: "bg-slate-400"
    };
  }

  return {
    label: "未上线",
    className: "bg-zinc-100 text-zinc-600",
    dotClassName: "bg-zinc-400"
  };
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

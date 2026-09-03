"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, RefreshCw, Save } from "lucide-react";
import { DeviceRecordsSection } from "@/components/devices/device-records-section";
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
  last_heartbeat_at: string | null;
  created_at: string;
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

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type DeviceDetailPanelProps = {
  deviceId: string;
};

export function DeviceDetailPanel({ deviceId }: DeviceDetailPanelProps) {
  const { isLoaded, hasPermission } = usePermissions();
  const canWriteDevices = isLoaded && hasPermission("device:write");
  const canControlDevices = isLoaded && hasPermission("device:control");
  const [device, setDevice] = useState<DeviceItem | null>(null);
  const [topics, setTopics] = useState<DeviceTopic[]>([]);
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0);
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

  async function loadDevice(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }
    setError("");

    try {
      const [deviceResponse, topicsResponse] = await Promise.all([
        fetch(`/api/v1/devices/${deviceId}`),
        fetch(`/api/v1/devices/${deviceId}/topics`)
      ]);
      const deviceBody = (await deviceResponse.json()) as ApiResponse<DeviceItem>;
      const topicsBody = (await topicsResponse.json()) as ApiResponse<DeviceTopic[]>;

      if (!deviceResponse.ok || deviceBody.code !== 0 || !deviceBody.data) {
        setError(deviceBody.message);
        return;
      }

      if (!topicsResponse.ok || topicsBody.code !== 0 || !topicsBody.data) {
        setError(topicsBody.message);
        return;
      }

      setDevice(deviceBody.data);
      setTopics(topicsBody.data);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
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

      setRecordsRefreshKey((key) => key + 1);
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
      const response = await fetch(`/api/v1/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          status: String(form.get("status") ?? "")
        })
      });
      const body = (await response.json()) as ApiResponse<DeviceItem>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setDevice(body.data);
      setMessage("设备信息已保存。");
    } catch {
      setError("保存设备失败，请稍后重试。");
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
    void loadDevice();

    const timer = window.setInterval(() => {
      void loadDevice(false);
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

      <DeviceRecordsSection
        deviceId={deviceId}
        pollIntervalMs={5000}
        refreshKey={recordsRefreshKey}
      />

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
    </div>
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

"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, RefreshCw, Save } from "lucide-react";

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

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type DeviceDetailPanelProps = {
  deviceId: string;
};

export function DeviceDetailPanel({ deviceId }: DeviceDetailPanelProps) {
  const [device, setDevice] = useState<DeviceItem | null>(null);
  const [shadow, setShadow] = useState<DeviceShadow | null>(null);
  const [desiredText, setDesiredText] = useState("{}");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadDevice() {
    setLoading(true);
    setError("");

    try {
      const [deviceResponse, shadowResponse] = await Promise.all([
        fetch(`/api/v1/devices/${deviceId}`),
        fetch(`/api/v1/devices/${deviceId}/shadow`)
      ]);
      const deviceBody = (await deviceResponse.json()) as ApiResponse<DeviceItem>;
      const shadowBody = (await shadowResponse.json()) as ApiResponse<DeviceShadow>;

      if (!deviceResponse.ok || deviceBody.code !== 0 || !deviceBody.data) {
        setError(deviceBody.message);
        return;
      }

      if (!shadowResponse.ok || shadowBody.code !== 0 || !shadowBody.data) {
        setError(shadowBody.message);
        return;
      }

      setDevice(deviceBody.data);
      setShadow(shadowBody.data);
      setDesiredText(JSON.stringify(shadowBody.data.desired, null, 2));
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
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
    void loadDevice();
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
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            disabled={saving}
            onClick={() => void resetSecret()}
            type="button"
          >
            <KeyRound className="h-4 w-4" />
            重置密钥
          </button>
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
          <Field label="状态">
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              defaultValue={device.status}
              name="status"
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </Field>
          <Info label="Product Key" value={device.product_key} mono />
          <Info label="Device Key" value={device.device_key} mono />
          <Info label="在线状态" value={device.online_status} />
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
              {message ? <span className="text-sm text-emerald-600">{message}</span> : null}
              {error ? <span className="text-sm text-rose-600">{error}</span> : null}
            </div>
          </div>
        </form>
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

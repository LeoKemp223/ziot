"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RefreshCw, Send } from "lucide-react";

type DeviceItem = {
  id: string;
  product_name: string;
  product_key: string;
  device_key: string;
  name: string;
  online_status: string;
};

type DeviceCommand = {
  id: string;
  identifier: string;
  params: unknown;
  status: string;
  request_id: string;
  result: unknown;
  error_message: string | null;
  created_at: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export function ControlConsolePanel() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [kind, setKind] = useState<"service" | "property_set">("service");
  const [identifier, setIdentifier] = useState("setSwitch");
  const [paramsText, setParamsText] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  );

  async function loadDevices() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/v1/devices", { cache: "no-store" });
      const body = (await response.json()) as ApiResponse<DeviceItem[]>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      const loadedDevices = body.data;
      setDevices(loadedDevices);
      setSelectedDeviceId((current) => current || loadedDevices[0]?.id || "");
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  async function loadCommands(deviceId = selectedDeviceId) {
    if (!deviceId) {
      setCommands([]);
      return;
    }

    try {
      const response = await fetch(`/api/v1/devices/${deviceId}/commands`, {
        cache: "no-store"
      });
      const body = (await response.json()) as ApiResponse<DeviceCommand[]>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setCommands(body.data);
    } catch {
      setError("加载命令记录失败。");
    }
  }

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");

    if (!selectedDeviceId) {
      setError("请先选择设备。");
      setPending(false);
      return;
    }

    try {
      const params = JSON.parse(paramsText) as unknown;
      const response = await fetch(`/api/v1/devices/${selectedDeviceId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          ...(kind === "service" ? { identifier } : {}),
          params,
          timeout_ms: 15000
        })
      });
      const body = (await response.json()) as ApiResponse<DeviceCommand>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setCommands((current) => [body.data as DeviceCommand, ...current].slice(0, 20));
      setMessage("控制指令已下发。");
    } catch (sendError) {
      setError(
        sendError instanceof SyntaxError
          ? "参数 JSON 格式不正确。"
          : "控制指令下发失败。"
      );
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, []);

  useEffect(() => {
    void loadCommands(selectedDeviceId);
  }, [selectedDeviceId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <form onSubmit={submitCommand}>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">控制下发</h2>
            <p className="mt-1 text-sm text-slate-500">
              选择设备后下发服务调用或属性设置。
            </p>
          </div>
          <div className="space-y-4 p-5">
            <Field label="设备">
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                disabled={loading}
                onChange={(event) => setSelectedDeviceId(event.currentTarget.value)}
                value={selectedDeviceId}
              >
                <option value="">{loading ? "正在加载设备..." : "选择设备"}</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.product_name} / {device.name}
                  </option>
                ))}
              </select>
            </Field>
            {selectedDevice ? (
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                <div className="font-medium text-slate-950">{selectedDevice.name}</div>
                <div className="mt-1 font-mono text-xs">
                  {selectedDevice.product_key} / {selectedDevice.device_key}
                </div>
              </div>
            ) : null}
            <Field label="类型">
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                onChange={(event) =>
                  setKind(
                    event.currentTarget.value === "property_set"
                      ? "property_set"
                      : "service"
                  )
                }
                value={kind}
              >
                <option value="service">服务调用</option>
                <option value="property_set">属性设置</option>
              </select>
            </Field>
            {kind === "service" ? (
              <Field label="服务标识">
                <input
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  onChange={(event) => setIdentifier(event.currentTarget.value)}
                  value={identifier}
                />
              </Field>
            ) : null}
            <Field label="参数 JSON">
              <textarea
                className="min-h-[180px] w-full rounded-md border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setParamsText(event.currentTarget.value)}
                spellCheck={false}
                value={paramsText}
              />
            </Field>
            {message ? <div className="text-sm text-emerald-600">{message}</div> : null}
            {error ? <div className="text-sm text-rose-600">{error}</div> : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={loading}
              onClick={() => void loadDevices()}
              type="button"
            >
              <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
              刷新设备
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={pending || !selectedDeviceId}
              type="submit"
            >
              {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              下发
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">命令记录</h2>
            <p className="mt-1 text-sm text-slate-500">当前设备最近控制指令。</p>
          </div>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => void loadCommands()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
        {commands.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">暂无命令记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">指令</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">参数</th>
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
                    <td className="px-4 py-4">{command.status}</td>
                    <td className="px-4 py-4">
                      <pre className="max-h-28 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-600">
                        {JSON.stringify(command.params, null, 2)}
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
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
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

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DeviceRecordsSection } from "@/components/devices/device-records-section";
import { RefreshCw, Send } from "lucide-react";

type DeviceItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_key: string;
  device_key: string;
  name: string;
  online_status: string;
};

type DeviceCommand = {
  id: string;
  request_id: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type DevicesResponse = ApiResponse<{
  items: DeviceItem[];
}>;

export function ControlConsolePanel() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0);
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
      const response = await fetch("/api/v1/devices?page_size=100", {
        cache: "no-store"
      });
      const body = (await response.json()) as DevicesResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      const loadedDevices = body.data.items;
      setDevices(loadedDevices);
      setSelectedDeviceId((current) => current || loadedDevices[0]?.id || "");
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
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

      setRecordsRefreshKey((key) => key + 1);
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
                    {device.product_name} / {device.name}（{onlineStatusLabel(device.online_status)}）
                  </option>
                ))}
              </select>
            </Field>
            {selectedDevice ? (
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-950">
                    {selectedDevice.name}
                  </span>
                  <OnlineStatusBadge value={selectedDevice.online_status} />
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
                  className="h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  onChange={(event) => setIdentifier(event.currentTarget.value)}
                  placeholder="setSwitch"
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

      <DeviceRecordsSection
        deviceId={selectedDeviceId}
        refreshKey={recordsRefreshKey}
      />
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

function onlineStatusLabel(value: string) {
  if (value === "online") {
    return "在线";
  }

  return value === "offline" ? "离线" : "未上线";
}

function OnlineStatusBadge({ value }: { value: string }) {
  const meta =
    value === "online"
      ? { label: "在线", className: "bg-emerald-50 text-emerald-700" }
      : value === "offline"
        ? { label: "离线", className: "bg-slate-200 text-slate-600" }
        : { label: "未上线", className: "bg-zinc-200 text-zinc-600" };

  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Eye, Pencil, Plus, Power, RefreshCw, Trash2, Users } from "lucide-react";
import type { ProductDto } from "@/lib/products/product-service";

type DeviceItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_key: string;
  device_key: string;
  device_secret?: string;
  name: string;
  status: string;
  online_status: string;
  last_heartbeat_at: string | null;
  created_at: string;
};

type DeviceGroup = {
  id: string;
  product_id: string;
  product_name: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export function DeviceListPanel() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [createdSecret, setCreatedSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function loadData(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }
    setError("");

    try {
      const [devicesResponse, productsResponse, groupsResponse] = await Promise.all([
        fetch("/api/v1/devices"),
        fetch("/api/v1/products"),
        fetch("/api/v1/device-groups")
      ]);
      const devicesBody = (await devicesResponse.json()) as ApiResponse<DeviceItem[]>;
      const productsBody = (await productsResponse.json()) as ApiResponse<{
        items: ProductDto[];
      }>;
      const groupsBody = (await groupsResponse.json()) as ApiResponse<DeviceGroup[]>;

      if (!devicesResponse.ok || devicesBody.code !== 0 || !devicesBody.data) {
        setError(devicesBody.message);
        return;
      }

      if (!productsResponse.ok || productsBody.code !== 0 || !productsBody.data) {
        setError(productsBody.message);
        return;
      }

      if (!groupsResponse.ok || groupsBody.code !== 0 || !groupsBody.data) {
        setError(groupsBody.message);
        return;
      }

      setDevices(devicesBody.data);
      setProducts(productsBody.data.items);
      setGroups(groupsBody.data);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    setCreatedSecret("");

    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/v1/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product_id: String(form.get("product_id") ?? ""),
          name: String(form.get("name") ?? "")
        })
      });
      const body = (await response.json()) as ApiResponse<DeviceItem>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setCreatedSecret(body.data.device_secret ?? "");
      formElement.reset();
      await loadData();
    } catch {
      setError("创建设备失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");

    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/v1/device-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product_id: String(form.get("product_id") ?? ""),
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? "")
        })
      });
      const body = (await response.json()) as ApiResponse<DeviceGroup>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      formElement.reset();
      await loadData();
    } catch {
      setError("创建设备分组失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function updateDeviceName(device: DeviceItem) {
    const name = window.prompt("设备名称", device.name);

    if (name === null || name.trim() === device.name) {
      return;
    }

    await mutateDevice(device.id, { name: name.trim() });
  }

  async function toggleDeviceStatus(device: DeviceItem) {
    const nextStatus = device.status === "active" ? "disabled" : "active";

    await mutateDevice(device.id, { status: nextStatus });
  }

  async function deleteDevice(device: DeviceItem) {
    if (!window.confirm(`确认删除设备 ${device.name}？`)) {
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/v1/devices/${device.id}`, {
        method: "DELETE"
      });
      const body = (await response.json()) as ApiResponse<{ id: string }>;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        return;
      }

      await loadData();
    } catch {
      setError("删除设备失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function mutateDevice(deviceId: string, payload: Record<string, unknown>) {
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/v1/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as ApiResponse<DeviceItem>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      await loadData();
    } catch {
      setError("更新设备失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function addDeviceToGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");

    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/v1/device-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          group_id: String(form.get("group_id") ?? ""),
          device_id: String(form.get("device_id") ?? "")
        })
      });
      const body = (await response.json()) as ApiResponse<{
        group_id: string;
        device_id: string;
      }>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      formElement.reset();
      await loadData();
    } catch {
      setError("添加设备到分组失败，请确认产品一致。");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void loadData();

    const timer = window.setInterval(() => {
      void loadData(false);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">创建设备</h2>
            <p className="mt-1 text-sm text-slate-500">
              设备密钥只在创建后显示一次
            </p>
          </div>
          <form className="space-y-4 p-5" onSubmit={createDevice}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">所属产品</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                name="product_id"
                required
              >
                <option value="">选择产品</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">设备名称</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                maxLength={128}
                name="name"
                placeholder="网关设备"
                required
              />
            </label>
            {createdSecret ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs font-medium text-emerald-700">
                  设备密钥
                </div>
                <div className="mt-1 break-all font-mono text-sm text-emerald-900">
                  {createdSecret}
                </div>
              </div>
            ) : null}
            {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={pending || loading}
              type="submit"
            >
              {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              创建
            </button>
          </form>
        </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">设备列表</h2>
            <p className="mt-1 text-sm text-slate-500">当前组织下的设备资源</p>
          </div>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
            onClick={() => void loadData()}
            type="button"
          >
            <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
            刷新
          </button>
        </div>
        {devices.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            {loading ? "正在加载设备..." : "暂无设备。"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">设备</th>
                  <th className="px-4 py-3">所属产品</th>
                  <th className="px-4 py-3">Device Key</th>
                  <th className="px-4 py-3">在线状态</th>
                  <th className="px-4 py-3">最后心跳</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((device) => (
                  <tr className="hover:bg-slate-50" key={device.id}>
                    <td className="px-5 py-4">
                      <a
                        className="font-medium text-slate-950 hover:text-blue-700"
                        href={`/devices/${device.id}`}
                      >
                        {device.name}
                      </a>
                      <div className="mt-1 font-mono text-xs text-slate-400">
                        {device.id}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {device.product_name}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-700">
                      {device.device_key}
                    </td>
                    <td className="px-4 py-4">
                      <OnlineStatusBadge value={device.online_status} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                      {device.last_heartbeat_at
                        ? formatDateTime(device.last_heartbeat_at)
                        : "-"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(device.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <a
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                          href={`/devices/${device.id}`}
                          title="详情"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          disabled={pending}
                          onClick={() => void updateDeviceName(device)}
                          title="修改"
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                          disabled={pending}
                          onClick={() => void toggleDeviceStatus(device)}
                          title={device.status === "active" ? "禁用" : "启用"}
                          type="button"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          disabled={pending}
                          onClick={() => void deleteDevice(device)}
                          title="删除"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">设备分组</h2>
          <p className="mt-1 text-sm text-slate-500">
            分组只允许添加同一产品下的设备。
          </p>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-x-auto">
            {groups.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                {loading ? "正在加载分组..." : "暂无分组。"}
              </div>
            ) : (
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">分组</th>
                    <th className="px-4 py-3">所属产品</th>
                    <th className="px-4 py-3">成员数</th>
                    <th className="px-4 py-3">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-950">{group.name}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {group.description || group.id}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {group.product_name}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {group.member_count}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                        {formatDateTime(group.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="space-y-4">
            <form className="space-y-3" onSubmit={createGroup}>
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <Users className="h-4 w-4" />
                新建分组
              </div>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                name="product_id"
                required
              >
                <option value="">选择产品</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                maxLength={128}
                name="name"
                placeholder="分组名称"
                required
              />
              <input
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                name="description"
                placeholder="描述"
              />
              <button
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                <Plus className="h-4 w-4" />
                创建分组
              </button>
            </form>
            <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={addDeviceToGroup}>
              <div className="text-sm font-medium text-slate-900">添加成员</div>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                name="group_id"
                required
              >
                <option value="">选择分组</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                name="device_id"
                required
              >
                <option value="">选择设备</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
              <button
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                <Plus className="h-4 w-4" />
                添加
              </button>
            </form>
          </div>
        </div>
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
    label: "未知",
    className: "bg-zinc-100 text-zinc-600",
    dotClassName: "bg-zinc-400"
  };
}

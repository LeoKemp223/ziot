"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Copy, Eye, Pencil, Plus, QrCode, RefreshCw, Trash2, X } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { ProductDto } from "@/lib/products/product-service";
import { usePermissions } from "@/components/console/use-permissions";

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

type ProductsResponse = ApiResponse<{
  items: ProductDto[];
  pagination: Pagination;
}>;

type DevicesResponse = ApiResponse<{
  items: DeviceItem[];
  pagination: Pagination;
}>;

type BindingCodeData = {
  device_id: string;
  code: string;
  qr_content: string;
  qr_data_url: string;
  generated_at: string | null;
};

type BoundUserItem = {
  id: string;
  nickname: string;
  phone: string;
  alias: string | null;
  bound_at: string;
};

export function DeviceCreateForm() {
  const [secretCopied, setSecretCopied] = useState(false);
  const { isLoaded, hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [createdSecret, setCreatedSecret] = useState("");

  async function copyCreatedSecret() {
    const copied = await copyTextToClipboard(createdSecret);

    setSecretCopied(copied);
    if (copied) {
      window.setTimeout(() => setSecretCopied(false), 2000);
    }
  }

  async function loadProducts() {
    setLoadingProducts(true);
    setError("");

    try {
      const response = await fetch("/api/v1/products?page_size=100", {
        headers: { accept: "application/json" }
      });
      const body = (await response.json()) as ProductsResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setProducts(body.data.items);
    } catch {
      setError("请求失败，请确认 Web 服务和数据库状态。");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    setCreatedSecret("");
    setSecretCopied(false);

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
      window.dispatchEvent(new Event("ziot:devices:changed"));
    } catch {
      setError("创建设备失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void loadProducts();
    window.addEventListener("ziot:products:changed", loadProducts);

    return () => {
      window.removeEventListener("ziot:products:changed", loadProducts);
    };
  }, []);

  return (
    <>
      {isLoaded && hasPermission("device:write") ? (
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          onClick={() => {
            setError("");
            setCreatedSecret("");
            setSecretCopied(false);
            setOpen(true);
          }}
          type="button"
        >
          <Plus className="h-4 w-4" />
          创建设备
        </button>
      ) : null}

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          {createdSecret ? (
            <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    设备已创建
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    设备密钥只在创建后显示一次，请妥善保存。
                  </p>
                </div>
                <button
                  aria-label="关闭"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-5">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-medium text-emerald-700">
                    设备密钥
                  </div>
                  <div className="mt-1 break-all font-mono text-sm text-emerald-900">
                    {createdSecret}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => void copyCreatedSecret()}
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                  {secretCopied ? "已复制" : "复制密钥"}
                </button>
                <button
                  className="inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  关闭
                </button>
              </div>
            </div>
          ) : (
            <form
              className="w-full max-w-xl rounded-lg bg-white shadow-xl"
              onSubmit={createDevice}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    创建设备
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    设备密钥只在创建后显示一次。每个产品最多 50 个设备，删除旧设备可释放名额。
                  </p>
                </div>
                <button
                  aria-label="关闭"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    所属产品
                  </span>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    disabled={loadingProducts}
                    name="product_id"
                    required
                  >
                    <option value="">
                      {loadingProducts ? "正在加载产品..." : "选择产品"}
                    </option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    设备名称
                  </span>
                  <input
                    autoComplete="off"
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    maxLength={128}
                    name="name"
                    placeholder="网关设备"
                    required
                  />
                </label>
                {error ? <div className="text-sm text-rose-600">{error}</div> : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  关闭
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending || loadingProducts || products.length === 0}
                  type="submit"
                >
                  {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  创建
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </>
  );
}

export function DeviceListPanel() {
  const { isLoaded, hasPermission } = usePermissions();
  const canWriteDevices = isLoaded && hasPermission("device:write");
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [editingDevice, setEditingDevice] = useState<{
    id: string;
    name: string;
    product_id: string;
  } | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<DeviceItem | null>(null);
  const [secretDevice, setSecretDevice] = useState<DeviceItem | null>(null);
  const [confirmSecretDevice, setConfirmSecretDevice] = useState<DeviceItem | null>(null);
  const [deviceSecret, setDeviceSecret] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);
  const [qrDevice, setQrDevice] = useState<DeviceItem | null>(null);
  const [bindingCodeData, setBindingCodeData] = useState<BindingCodeData | null>(null);
  const [boundUsers, setBoundUsers] = useState<BoundUserItem[]>([]);
  const [qrLoading, setQrLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  async function loadData(
    showLoading = true,
    productId = selectedProductId,
    page = pagination.page
  ) {
    if (showLoading) {
      setLoading(true);
    }
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pagination.page_size)
    });
    if (productId) {
      params.set("product_id", productId);
    }

    try {
      const [devicesResponse, productsResponse] = await Promise.all([
        fetch(`/api/v1/devices?${params.toString()}`),
        fetch("/api/v1/products?page_size=100", {
          headers: { accept: "application/json" }
        })
      ]);
      const devicesBody = (await devicesResponse.json()) as DevicesResponse;
      const productsBody = (await productsResponse.json()) as ProductsResponse;

      if (!devicesResponse.ok || devicesBody.code !== 0 || !devicesBody.data) {
        setError(devicesBody.message);
        return;
      }

      if (!productsResponse.ok || productsBody.code !== 0 || !productsBody.data) {
        setError(productsBody.message);
        return;
      }

      setDevices(devicesBody.data.items);
      setPagination(devicesBody.data.pagination);
      setProducts(productsBody.data.items);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  async function saveEditingDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingDevice) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();

    if (name && name !== editingDevice.name) {
      await mutateDevice(editingDevice.id, { name });
    }

    setEditingDevice(null);
  }

  async function deleteDevice() {
    if (!deletingDevice) {
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/v1/devices/${deletingDevice.id}`, {
        method: "DELETE"
      });
      const body = (await response.json()) as ApiResponse<{ id: string }>;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        return;
      }

      await loadData(
        true,
        selectedProductId,
        devices.length === 1 && pagination.page > 1
          ? pagination.page - 1
          : pagination.page
      );
    } catch {
      setError("删除设备失败，请稍后重试。");
    } finally {
      setPending(false);
      setDeletingDevice(null);
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

      await loadData(true, selectedProductId, pagination.page);
    } catch {
      setError("更新设备失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function viewDeviceSecret(device: DeviceItem) {
    setPending(true);
    setError("");
    setSecretCopied(false);
    try {
      const response = await fetch(`/api/v1/devices/${device.id}/secret`, { method: "POST" });
      const body = (await response.json()) as ApiResponse<DeviceItem>;
      if (!response.ok || body.code !== 0 || !body.data?.device_secret) {
        setError(body.message || "获取设备密钥失败，请稍后重试。");
        return;
      }
      setDeviceSecret(body.data.device_secret);
      setSecretDevice(device);
    } catch {
      setError("获取设备密钥失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function openQrModal(device: DeviceItem) {
    setQrDevice(device);
    setBindingCodeData(null);
    setBoundUsers([]);
    setCodeCopied(false);
    setConfirmRotate(false);
    setQrLoading(true);
    setError("");

    try {
      const [codeResponse, bindingsResponse] = await Promise.all([
        fetch(`/api/v1/devices/${device.id}/binding-code`),
        fetch(`/api/v1/devices/${device.id}/bindings?page_size=50`)
      ]);
      const codeBody = (await codeResponse.json()) as ApiResponse<BindingCodeData>;
      const bindingsBody = (await bindingsResponse.json()) as ApiResponse<{
        items: BoundUserItem[];
      }>;

      if (!codeResponse.ok || codeBody.code !== 0 || !codeBody.data) {
        setError(codeBody.message || "获取设备二维码失败，请稍后重试。");
        return;
      }

      setBindingCodeData(codeBody.data);
      if (bindingsResponse.ok && bindingsBody.code === 0 && bindingsBody.data) {
        setBoundUsers(bindingsBody.data.items);
      }
    } catch {
      setError("获取设备二维码失败，请稍后重试。");
    } finally {
      setQrLoading(false);
    }
  }

  async function rotateQr() {
    if (!qrDevice) {
      return;
    }

    setRotating(true);
    setError("");

    try {
      const response = await fetch(
        `/api/v1/devices/${qrDevice.id}/binding-code`,
        { method: "POST" }
      );
      const body = (await response.json()) as ApiResponse<BindingCodeData>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message || "重新生成失败，请稍后重试。");
        return;
      }

      setBindingCodeData(body.data);
      setConfirmRotate(false);
    } catch {
      setError("重新生成失败，请稍后重试。");
    } finally {
      setRotating(false);
    }
  }

  async function copyBindingCode() {
    if (!bindingCodeData) {
      return;
    }

    const copied = await copyTextToClipboard(bindingCodeData.code);
    setCodeCopied(copied);
    if (copied) {
      window.setTimeout(() => setCodeCopied(false), 2000);
    }
  }

  useEffect(() => {
    void loadData(true, selectedProductId, 1);

    const timer = window.setInterval(() => {
      void loadData(false);
    }, 5000);
    const refreshDevices = () => {
      void loadData(true, selectedProductId, 1);
    };
    window.addEventListener("ziot:devices:changed", refreshDevices);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("ziot:devices:changed", refreshDevices);
    };
  }, [selectedProductId]);

  return (
    <>
      {deletingDevice ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  删除设备
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  删除后设备进入回收状态，不可恢复。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setDeletingDevice(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-5 text-sm text-slate-600">
              <div>
                确定删除设备
                <span className="mx-1 font-medium text-slate-950">
                  「{deletingDevice.name}」
                </span>
                ？
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
                {deletingDevice.product_name} / {deletingDevice.device_key}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setDeletingDevice(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => void deleteDevice()}
                type="button"
              >
                {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {secretDevice ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">设备密钥</h2>
                <p className="mt-1 text-sm text-amber-600">密钥已重新生成，旧密钥立即失效。请妥善保存。</p>
              </div>
              <button aria-label="关闭" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => setSecretDevice(null)} type="button"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-5">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                <div className="text-xs font-medium text-blue-700">{secretDevice.name} / {secretDevice.device_key}</div>
                <div className="mt-2 break-all font-mono text-sm text-blue-950">{deviceSecret}</div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={async () => { const copied = await copyTextToClipboard(deviceSecret); setSecretCopied(copied); }} type="button"><Copy className="h-4 w-4" />{secretCopied ? "已复制" : "复制密钥"}</button>
              <button className="inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800" onClick={() => setSecretDevice(null)} type="button">关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmSecretDevice ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">重新生成设备密钥</h2>
                <p className="mt-1 text-sm text-slate-500">{confirmSecretDevice.name} / {confirmSecretDevice.device_key}</p>
              </div>
              <button aria-label="关闭" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => setConfirmSecretDevice(null)} type="button"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-5 text-sm text-slate-600">
              旧密钥将立即失效，确认后只能查看一次新密钥。确定继续吗？
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setConfirmSecretDevice(null)} type="button">取消</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60" disabled={pending} onClick={() => { const device = confirmSecretDevice; setConfirmSecretDevice(null); void viewDeviceSecret(device); }} type="button">
                {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}确认生成
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrDevice ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  设备二维码
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {qrDevice.name} / {qrDevice.device_key}
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setQrDevice(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {qrLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  正在加载二维码...
                </div>
              ) : bindingCodeData ? (
                <>
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="设备绑定二维码"
                      className="h-[240px] w-[240px] rounded-md border border-slate-200"
                      src={bindingCodeData.qr_data_url}
                    />
                  </div>
                  <p className="text-center text-xs text-slate-400">
                    永久有效，可印刷到产品上；用户扫码即可绑定设备
                  </p>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <span className="break-all font-mono text-sm font-medium text-emerald-900">
                      {bindingCodeData.code}
                    </span>
                    <button
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      onClick={() => void copyBindingCode()}
                      type="button"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {codeCopied ? "已复制" : "复制"}
                    </button>
                  </div>
                  {confirmRotate ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <p>
                        重新生成后旧码立即失效，已印刷的旧二维码将无法绑定。确定继续吗？
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          onClick={() => setConfirmRotate(false)}
                          type="button"
                        >
                          取消
                        </button>
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-600 px-3 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-60"
                          disabled={rotating}
                          onClick={() => void rotateQr()}
                          type="button"
                        >
                          {rotating ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          确认重新生成
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      disabled={rotating}
                      onClick={() => setConfirmRotate(true)}
                      type="button"
                    >
                      <RefreshCw className="h-4 w-4" />
                      重新生成（旧码失效）
                    </button>
                  )}
                  <div className="border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-950">
                      已绑定的 App 用户（{boundUsers.length}）
                    </h3>
                    {boundUsers.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        暂无 App 用户绑定该设备。
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {boundUsers.map((bound) => (
                          <li
                            className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                            key={bound.id}
                          >
                            <span className="min-w-0 truncate font-medium text-slate-950">
                              {bound.alias || bound.nickname || bound.phone}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              {bound.phone} · {formatDateTime(bound.bound_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-rose-600">
                  二维码加载失败，请关闭后重试。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editingDevice ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <form
            className="w-full max-w-xl rounded-lg bg-white shadow-xl"
            onSubmit={saveEditingDevice}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  编辑设备
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  修改设备基础信息。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setEditingDevice(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  所属产品
                </span>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none"
                  disabled
                  name="product_id"
                >
                  <option value={editingDevice.product_id}>
                    {products.find((product) => product.id === editingDevice.product_id)
                      ?.name ?? editingDevice.product_id}
                  </option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  设备名称
                </span>
                <input
                  autoComplete="off"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  defaultValue={editingDevice.name}
                  key={editingDevice.id}
                  maxLength={128}
                  name="name"
                  placeholder="网关设备"
                  required
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setEditingDevice(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">设备列表</h2>
          <p className="mt-1 text-sm text-slate-500">当前组织下的设备资源</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="h-8 min-w-[220px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            onChange={(event) => {
              setPagination((current) => ({ ...current, page: 1 }));
              setSelectedProductId(event.currentTarget.value);
            }}
            value={selectedProductId}
          >
            <option value="">全部产品</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
            onClick={() => void loadData(true, selectedProductId, pagination.page)}
            type="button"
          >
            <RefreshCw
              className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")}
            />
            刷新
          </button>
          <div className="rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            {pagination.total} 台设备
          </div>
        </div>
      </div>
      {error ? (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
          {error}
        </div>
      ) : null}
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
                <th className="px-4 py-3">设备标识</th>
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
                      {canWriteDevices ? (
                        <>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                            disabled={pending}
                            onClick={() => void openQrModal(device)}
                            title="设备二维码（App 扫码绑定）"
                            type="button"
                          >
                            <QrCode className="h-4 w-4" />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                            disabled={pending}
                            onClick={() => setConfirmSecretDevice(device)}
                            title="查看密钥（将重新生成）"
                            type="button"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            disabled={pending}
                            onClick={() =>
                              setEditingDevice({
                                id: device.id,
                                name: device.name,
                                product_id: device.product_id
                              })
                            }
                            title="编辑"
                            type="button"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            disabled={pending}
                            onClick={() => {
                              setError("");
                              setDeletingDevice(device);
                            }}
                            title="删除"
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar
        disabled={loading}
        onPageChange={(page) => void loadData(true, selectedProductId, page)}
        pagination={pagination}
      />
      </section>
    </>
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
    label: "未上线",
    className: "bg-zinc-100 text-zinc-600",
    dotClassName: "bg-zinc-400"
  };
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Save } from "lucide-react";
import type { ProductDto } from "@/lib/products/product-service";

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type ProductDetailPanelProps = {
  productId: string;
};

export function ProductDetailPanel({ productId }: ProductDetailPanelProps) {
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [modelText, setModelText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProduct() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/v1/products/${productId}`);
      const body = (await response.json()) as ApiResponse<ProductDto>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setProduct(body.data);
      setModelText(JSON.stringify(body.data.thing_model, null, 2));
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  async function saveThingModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const parsed = JSON.parse(modelText) as unknown;
      const response = await fetch(`/api/v1/products/${productId}/thing-model`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thing_model: parsed })
      });
      const body = (await response.json()) as ApiResponse<ProductDto["thing_model"]>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      const thingModel = body.data;
      setModelText(JSON.stringify(thingModel, null, 2));
      setProduct((current) =>
        current ? { ...current, thing_model: thingModel } : current
      );
      setMessage("物模型已保存。");
    } catch (saveError) {
      setError(
        saveError instanceof SyntaxError
          ? "物模型 JSON 格式不正确。"
          : "保存物模型失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadProduct();
  }, [productId]);

  if (loading && !product) {
    return <div className="p-8 text-sm text-slate-500">正在加载产品...</div>;
  }

  if (!product) {
    return <div className="p-8 text-sm text-amber-700">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">基础信息</h2>
        </div>
        <div className="grid gap-4 px-5 py-5 md:grid-cols-3">
          <Info label="产品名称" value={product.name} />
          <Info label="Product Key" value={product.product_key} mono />
          <Info label="设备数" value={`${product.device_count}`} />
          <Info label="协议" value={product.protocols.join(", ")} />
          <Info label="认证方式" value={product.auth_type} />
          <Info label="数据格式" value={product.data_format} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">设备接入参数</h2>
        </div>
        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <Info label="MQTT Client ID" value="<device_key>" mono />
          <Info
            label="MQTT Username"
            value={`${product.product_key}:<device_key>`}
            mono
          />
          <Info label="HTTP Product Key" value={product.product_key} mono />
          <Info label="HTTP Device Key" value="<device_key>" mono />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <form onSubmit={saveThingModel}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">物模型</h2>
              <p className="mt-1 text-sm text-slate-500">
                使用 JSON 定义 properties、events 和 services。
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
              保存
            </button>
          </div>
          <div className="p-5">
            <textarea
              className="min-h-[360px] w-full rounded-md border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              onChange={(event) => setModelText(event.currentTarget.value)}
              spellCheck={false}
              value={modelText}
            />
            {message ? (
              <div className="mt-3 text-sm text-emerald-600">{message}</div>
            ) : null}
            {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
          </div>
        </form>
      </section>
    </div>
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

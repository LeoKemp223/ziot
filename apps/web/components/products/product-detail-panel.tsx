"use client";

import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(true);
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
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
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
        <div className="grid gap-4 px-5 py-5 md:grid-cols-4">
          <Info label="产品名称" value={product.name} />
          <Info label="产品标识" value={product.product_key} mono />
          <Info label="设备数" value={`${product.device_count}`} />
          <Info label="协议" value={product.protocols.join(", ")} />
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
        </div>
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

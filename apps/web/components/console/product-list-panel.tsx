"use client";

import { useEffect, useState } from "react";
import { Pencil, RefreshCw, Save, Trash2, X } from "lucide-react";
import type { ProductDto } from "@/lib/products/product-service";

type ProductListState =
  | { status: "loading"; products: ProductDto[]; error: null }
  | { status: "ready"; products: ProductDto[]; error: null }
  | { status: "error"; products: ProductDto[]; error: string };

type ProductsResponse = {
  code: number;
  message: string;
  data?: {
    items: ProductDto[];
  };
};

type ProductMutationResponse = {
  code: number;
  message: string;
  data?: ProductDto;
};

type ProductDeleteResponse = {
  code: number;
  message: string;
  data?: {
    id: string;
    deleted_at: string | null;
  };
};

export function ProductListPanel() {
  const [state, setState] = useState<ProductListState>({
    status: "loading",
    products: [],
    error: null
  });
  const [editingProduct, setEditingProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function loadProducts() {
    setState((current) => ({
      status: "loading",
      products: current.products,
      error: null
    }));

    try {
      const response = await fetch("/api/v1/products", {
        headers: { accept: "application/json" }
      });
      const body = (await response.json()) as ProductsResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        setState({
          status: "error",
          products: [],
          error:
            body.message === "internal server error"
              ? "暂时无法连接数据库。启动 PostgreSQL 并执行 seed 后可查看真实产品。"
              : body.message
        });
        return;
      }

      setState({
        status: "ready",
        products: body.data.items,
        error: null
      });
      setActionError("");
    } catch {
      setState({
        status: "error",
        products: [],
        error: "请求失败，请确认 Web 服务和数据库状态。"
      });
    }
  }

  async function saveProduct(product: ProductDto) {
    if (!editingProduct || editingProduct.id !== product.id) {
      return;
    }

    const name = editingProduct.name.trim();

    if (!name) {
      setActionError("产品名称不能为空。");
      return;
    }

    setPendingAction(`update:${product.id}`);
    setActionError("");

    try {
      const response = await fetch(`/api/v1/products/${product.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      const body = (await response.json()) as ProductMutationResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        throw new Error(body.message || "更新产品失败。");
      }

      setState((current) => ({
        ...current,
        products: current.products.map((item) =>
          item.id === body.data?.id ? body.data : item
        )
      }));
      setEditingProduct(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "更新产品失败，请稍后重试。"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteProduct(product: ProductDto) {
    if (!window.confirm(`确定删除产品「${product.name}」？`)) {
      return;
    }

    setPendingAction(`delete:${product.id}`);
    setActionError("");

    try {
      const response = await fetch(`/api/v1/products/${product.id}`, {
        method: "DELETE",
        headers: { accept: "application/json" }
      });
      const body = (await response.json()) as ProductDeleteResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        throw new Error(body.message || "删除产品失败。");
      }

      setState((current) => ({
        ...current,
        products: current.products.filter((item) => item.id !== body.data?.id)
      }));

      if (editingProduct?.id === product.id) {
        setEditingProduct(null);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "删除产品失败，请稍后重试。"
      );
    } finally {
      setPendingAction(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 0);
    window.addEventListener("ziot:products:changed", loadProducts);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ziot:products:changed", loadProducts);
    };
  }, []);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">产品列表</h2>
          <p className="mt-1 text-sm text-slate-500">默认组织下的产品资源</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            disabled={state.status === "loading"}
            onClick={() => void loadProducts()}
            type="button"
          >
            <RefreshCw
              className={[
                "h-4 w-4",
                state.status === "loading" ? "animate-spin" : ""
              ].join(" ")}
            />
            刷新
          </button>
          <div className="rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            {state.products.length} 个产品
          </div>
        </div>
      </div>
      {actionError ? (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
          {actionError}
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="p-8 text-sm text-amber-700">{state.error}</div>
      ) : state.products.length === 0 ? (
        <div className="p-8 text-sm text-slate-500">
          {state.status === "loading"
            ? "正在加载产品..."
            : "暂无产品，点击右上角创建产品。"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-3">产品</th>
                <th className="px-4 py-3">Product Key</th>
                <th className="px-4 py-3">协议</th>
                <th className="px-4 py-3">认证 / 格式</th>
                <th className="px-4 py-3">物模型</th>
                <th className="px-4 py-3">设备数</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.products.map((product) => {
                const model = product.thing_model;
                const modelSummary = `${model.properties.length} 属性 / ${model.events.length} 事件 / ${model.services.length} 服务`;
                const isEditing = editingProduct?.id === product.id;
                const isUpdating = pendingAction === `update:${product.id}`;
                const isDeleting = pendingAction === `delete:${product.id}`;

                return (
                  <tr className="align-top hover:bg-slate-50" key={product.id}>
                    <td className="px-5 py-4">
                      {isEditing ? (
                        <input
                          className="h-9 w-full max-w-[260px] rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-950 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          maxLength={128}
                          onChange={(event) =>
                            setEditingProduct({
                              id: product.id,
                              name: event.currentTarget.value
                            })
                          }
                          value={editingProduct.name}
                        />
                      ) : (
                        <div className="font-medium text-slate-950">
                          {product.name}
                        </div>
                      )}
                      <div className="mt-1 max-w-[260px] truncate font-mono text-xs text-slate-400">
                        {product.id}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                        {product.product_key}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {product.protocols.length > 0 ? (
                          product.protocols.map((protocol) => (
                            <span
                              className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium uppercase text-blue-700"
                              key={protocol}
                            >
                              {protocol}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <div>{product.auth_type}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {product.data_format}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <div className="whitespace-nowrap">{model.version}</div>
                      <div className="mt-1 whitespace-nowrap text-xs text-slate-400">
                        {modelSummary}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-900">
                      {product.device_count}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(product.created_at)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(product.updated_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              aria-label="保存产品"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={pendingAction !== null}
                              onClick={() => void saveProduct(product)}
                              title="保存"
                              type="button"
                            >
                              {isUpdating ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              aria-label="取消编辑"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={pendingAction !== null}
                              onClick={() => setEditingProduct(null)}
                              title="取消"
                              type="button"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              aria-label="编辑产品"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={pendingAction !== null}
                              onClick={() => {
                                setActionError("");
                                setEditingProduct({
                                  id: product.id,
                                  name: product.name
                                });
                              }}
                              title="编辑"
                              type="button"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              aria-label="删除产品"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={pendingAction !== null}
                              onClick={() => void deleteProduct(product)}
                              title="删除"
                              type="button"
                            >
                              {isDeleting ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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

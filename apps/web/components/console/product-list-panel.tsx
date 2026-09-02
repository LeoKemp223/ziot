"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Pencil, RefreshCw, Trash2, X } from "lucide-react";
import type { ProductDto } from "@/lib/products/product-service";
import { usePermissions } from "./use-permissions";

type ProductListState =
  | { status: "loading"; products: ProductDto[]; error: null }
  | { status: "ready"; products: ProductDto[]; error: null }
  | { status: "error"; products: ProductDto[]; error: string };

type ProductsResponse = {
  code: number;
  message: string;
  data?: {
    items: ProductDto[];
    pagination: Pagination;
  };
};

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
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
  const { isLoaded, hasPermission } = usePermissions();
  const canWriteProducts = isLoaded && hasPermission("product:write");
  const [state, setState] = useState<ProductListState>({
    status: "loading",
    products: [],
    error: null
  });
  const [editingProduct, setEditingProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ProductDto | null>(
    null
  );
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function loadProducts(page = pagination.page) {
    setState((current) => ({
      status: "loading",
      products: current.products,
      error: null
    }));

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pagination.page_size)
      });
      const response = await fetch(`/api/v1/products?${params.toString()}`, {
        headers: { accept: "application/json" }
      });
      const body = (await response.json()) as ProductsResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        setState({
          status: "error",
          products: [],
          error:
            body.message === "服务器内部错误"
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
      setPagination(body.data.pagination);
      setActionError("");
    } catch {
      setState({
        status: "error",
        products: [],
        error: "请求失败，请确认 Web 服务和数据库状态。"
      });
    }
  }

  async function saveEditingProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingProduct) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();

    setPendingAction(`update:${editingProduct.id}`);
    setActionError("");

    try {
      const response = await fetch(`/api/v1/products/${editingProduct.id}`, {
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
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "更新产品失败，请稍后重试。"
      );
    } finally {
      setPendingAction(null);
      setEditingProduct(null);
    }
  }

  async function deleteProduct() {
    if (!deletingProduct) {
      return;
    }

    setPendingAction(`delete:${deletingProduct.id}`);
    setActionError("");

    try {
      const response = await fetch(`/api/v1/products/${deletingProduct.id}`, {
        method: "DELETE",
        headers: { accept: "application/json" }
      });
      const body = (await response.json()) as ProductDeleteResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        throw new Error(body.message || "删除产品失败。");
      }

      await loadProducts(
        state.products.length === 1 && pagination.page > 1
          ? pagination.page - 1
          : pagination.page
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "删除产品失败，请稍后重试。"
      );
    } finally {
      setPendingAction(null);
      setDeletingProduct(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 0);
    const refreshProducts = () => {
      void loadProducts(1);
    };
    window.addEventListener("ziot:products:changed", refreshProducts);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ziot:products:changed", refreshProducts);
    };
  }, []);

  return (
    <>
      {editingProduct ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <form
            className="w-full max-w-xl rounded-lg bg-white shadow-xl"
            onSubmit={saveEditingProduct}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  编辑产品
                </h2>
                <p className="mt-1 text-sm text-slate-500">修改产品基础信息。</p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setEditingProduct(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  产品标识
                </span>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-500 outline-none"
                  disabled
                  readOnly
                  value={
                    state.products.find(
                      (product) => product.id === editingProduct.id
                    )?.product_key ?? ""
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  产品名称
                </span>
                <input
                  autoComplete="off"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  defaultValue={editingProduct.name}
                  key={editingProduct.id}
                  maxLength={128}
                  name="name"
                  placeholder="温湿度传感器"
                  required
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setEditingProduct(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pendingAction !== null}
                type="submit"
              >
                {pendingAction === `update:${editingProduct.id}` ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : null}
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deletingProduct ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  删除产品
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  删除后产品进入回收状态，不可恢复。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setDeletingProduct(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-5 text-sm text-slate-600">
              <div>
                确定删除产品
                <span className="mx-1 font-medium text-slate-950">
                  「{deletingProduct.name}」
                </span>
                ？
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
                {deletingProduct.product_key}
              </div>
              {deletingProduct.device_count > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                  该产品下还有 {deletingProduct.device_count} 台设备，无法删除。
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setDeletingProduct(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  pendingAction !== null || deletingProduct.device_count > 0
                }
                onClick={() => void deleteProduct()}
                type="button"
              >
                {pendingAction === `delete:${deletingProduct.id}` ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : null}
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
            {pagination.total} 个产品
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
                <th className="px-4 py-3">产品标识</th>
                <th className="px-4 py-3">协议</th>
                <th className="px-4 py-3">设备数</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">更新时间</th>
                {canWriteProducts ? (
                  <th className="px-5 py-3 text-right">操作</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.products.map((product) => {
                const isDeleting = pendingAction === `delete:${product.id}`;

                return (
                  <tr className="align-top hover:bg-slate-50" key={product.id}>
                    <td className="px-5 py-4">
                      <a
                        className="font-medium text-slate-950 hover:text-blue-700"
                        href={`/products/${product.id}`}
                      >
                        {product.name}
                      </a>
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
                    {canWriteProducts ? (
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
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
                            onClick={() => {
                              setActionError("");
                              setDeletingProduct(product);
                            }}
                            title="删除"
                            type="button"
                          >
                            {isDeleting ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar
        disabled={state.status === "loading"}
        onPageChange={(page) => void loadProducts(page)}
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

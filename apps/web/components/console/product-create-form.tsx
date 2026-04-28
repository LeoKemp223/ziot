"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw, X } from "lucide-react";

type SubmitState =
  | { status: "idle"; message: "" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function ProductCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SubmitState>({
    status: "idle",
    message: ""
  });
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setState({ status: "idle", message: "" });

    const form = new FormData(formElement);
    const payload = {
      product_key: String(form.get("product_key") ?? ""),
      name: String(form.get("name") ?? ""),
      protocols: ["mqtt"],
      auth_type: "device_secret",
      data_format: "json"
    };

    try {
      const response = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as {
        code: number;
        message: string;
      };

      if (!response.ok || body.code !== 0) {
        setState({ status: "error", message: body.message });
        return;
      }

      formElement.reset();
      window.dispatchEvent(new Event("ziot:products:changed"));
      setState({ status: "success", message: "产品已创建。" });
      setOpen(false);
    } catch {
      setState({ status: "error", message: "请求失败，请确认数据库已启动。" });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        onClick={() => {
          setState({ status: "idle", message: "" });
          setOpen(true);
        }}
        type="button"
      >
        <Plus className="h-4 w-4" />
        创建产品
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <form
            className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
            onSubmit={handleSubmit}
            ref={formRef}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  创建产品
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  当前阶段默认使用 MQTT、设备密钥认证和 JSON 数据格式。
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

            <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Product Key
                </span>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  name="product_key"
                  pattern="[A-Za-z0-9_-]{3,64}"
                  placeholder="pk_sensor"
                  required
                />
                <span className="mt-1 block text-xs text-slate-400">
                  3-64 位，字母、数字、下划线或中划线
                </span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  产品名称
                </span>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  maxLength={128}
                  name="name"
                  placeholder="温湿度传感器"
                  required
                />
              </label>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-700">协议</div>
                <div className="mt-2 inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  MQTT
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-700">
                  认证与格式
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                    device_secret
                  </span>
                  <span className="rounded-md bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                    json
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <div
                className={[
                  "text-sm",
                  state.status === "error"
                    ? "text-rose-600"
                    : "text-emerald-600"
                ].join(" ")}
              >
                {state.message}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : null}
                  创建
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

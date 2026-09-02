"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import { usePermissions } from "./use-permissions";

type SubmitState =
  | { status: "idle"; message: "" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function ProductCreateForm() {
  const { isLoaded, hasPermission } = usePermissions();
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
      {isLoaded && hasPermission("product:write") ? (
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
      ) : null}

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <form
            className="w-full max-w-xl rounded-lg bg-white shadow-xl"
            onSubmit={handleSubmit}
            ref={formRef}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  创建产品
                </h2>
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
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  产品名称
                </span>
                <input
                  autoComplete="off"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  maxLength={128}
                  name="name"
                  placeholder="温湿度传感器"
                  required
                />
              </label>
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

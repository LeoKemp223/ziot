"use client";

import { useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";

type AuthFormProps = {
  mode: "login" | "register" | "reset";
};

type ApiResponse = {
  code: number;
  message: string;
};

export function AuthForm({ mode }: AuthFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload =
      mode === "login"
        ? {
            account: String(form.get("account") ?? "").trim(),
            password: String(form.get("password") ?? "")
          }
        : {
            account: String(form.get("account") ?? "").trim(),
            password: String(form.get("password") ?? ""),
            ...(mode === "register"
              ? { display_name: String(form.get("display_name") ?? "") }
              : {}),
            invitation_code: String(form.get("invitation_code") ?? "")
              .trim()
              .toUpperCase()
          };

    try {
      const endpoint = mode === "reset" ? "reset-password" : mode;
      const response = await fetch(`/api/v1/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as ApiResponse;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        return;
      }

      window.location.href = mode === "reset" ? "/login?reset=success" : "/";
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">手机号</span>
        <input
          autoComplete={mode === "login" ? "username" : "tel"}
          className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          inputMode={mode === "login" ? undefined : "numeric"}
          maxLength={mode === "login" ? undefined : 11}
          name="account"
          pattern={mode === "login" ? undefined : "1[3-9][0-9]{9}"}
          placeholder="13800000001"
          required
          type="tel"
        />
      </label>

      {mode === "register" ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">姓名/昵称</span>
          <input
            autoComplete="name"
            className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            maxLength={128}
            name="display_name"
            placeholder="张三"
            required
          />
        </label>
      ) : null}

      <label className="block">
        <span className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            {mode === "reset" ? "新密码" : "密码"}
          </span>
          {mode === "login" ? (
            <a
              className="text-sm font-medium text-blue-700 hover:text-blue-800"
              href="/reset-password"
            >
              忘记密码？
            </a>
          ) : null}
        </span>
        <input
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>

      {mode !== "login" ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">邀请码</span>
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-sm uppercase outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            maxLength={10}
            name="invitation_code"
            placeholder="INVG6R35ZS"
            required
          />
        </label>
      ) : null}

      {error ? <div className="text-sm text-rose-600">{error}</div> : null}

      <button
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
        {mode === "login" ? "登录" : mode === "register" ? "注册并登录" : "重置密码"}
      </button>
    </form>
  );
}

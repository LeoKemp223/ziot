"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload =
      mode === "login"
        ? {
            account: String(form.get("account") ?? "").trim(),
            password: String(form.get("password") ?? ""),
          }
        : {
            account: String(form.get("account") ?? "").trim(),
            password: String(form.get("password") ?? ""),
            ...(mode === "register"
              ? { display_name: String(form.get("display_name") ?? "") }
              : {}),
            invitation_code: String(form.get("invitation_code") ?? "")
              .trim()
              .toUpperCase(),
          };

    try {
      const endpoint = mode === "reset" ? "reset-password" : mode;
      const response = await fetch(`/api/v1/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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
    <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-semibold text-slate-800">手机号</span>
        <input
          autoComplete={mode === "login" ? "username" : "tel"}
          className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
          inputMode={mode === "login" ? undefined : "numeric"}
          maxLength={mode === "login" ? undefined : 11}
          name="account"
          placeholder={mode === "login" ? "" : "请输入手机号"}
          pattern={mode === "login" ? undefined : "1[3-9][0-9]{9}"}
          required
          type="tel"
        />
      </label>

      {mode === "register" ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">姓名/昵称</span>
          <input
            autoComplete="name"
            className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            maxLength={128}
            name="display_name"
            placeholder="张三"
            required
          />
        </label>
      ) : null}

      <label className="block">
        <span className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">
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
        <div className="relative mt-2">
          <input
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 pr-11 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            minLength={8}
            name="password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </label>

      {mode !== "login" ? (
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">邀请码</span>
          <input
            className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 font-mono text-sm uppercase outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            maxLength={10}
            name="invitation_code"
            required
          />
        </label>
      ) : null}

      {error ? (
        <div
          aria-live="polite"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <button
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
        {mode === "login"
          ? "登录"
          : mode === "register"
            ? "注册并登录"
            : "重置密码"}
      </button>
    </form>
  );
}

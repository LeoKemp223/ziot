import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">登录</h1>
          <p className="mt-1 text-sm text-slate-500">
            使用组织账号进入 ZIOT Console。
          </p>
        </div>
        <AuthForm mode="login" />
        <div className="mt-4 text-sm text-slate-500">
          还没有账号？{" "}
          <a className="font-medium text-blue-700 hover:text-blue-800" href="/register">
            使用邀请码注册
          </a>
        </div>
      </section>
    </main>
  );
}

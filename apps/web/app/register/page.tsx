import { AuthForm } from "@/components/auth/auth-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">邀请码注册</h1>
          <p className="mt-1 text-sm text-slate-500">
            注册后会自动绑定邀请码所属组织和角色。
          </p>
        </div>
        <AuthForm mode="register" />
        <div className="mt-4 text-sm text-slate-500">
          已有账号？{" "}
          <a className="font-medium text-blue-700 hover:text-blue-800" href="/login">
            返回登录
          </a>
        </div>
      </section>
    </main>
  );
}

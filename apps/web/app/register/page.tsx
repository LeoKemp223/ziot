import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  return (
    <AuthShell title="创建组织账号" description="使用邀请码注册，注册后自动绑定所属组织和角色。">
        <AuthForm mode="register" />
        <div className="mt-4 text-sm text-slate-500">
          已有账号？{" "}
          <a className="font-medium text-blue-700 hover:text-blue-800" href="/login">
            返回登录
          </a>
        </div>
    </AuthShell>
  );
}

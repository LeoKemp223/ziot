import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ResetPasswordPage() {
  return (
    <AuthShell title="重置密码" description="使用组织发放的邀请码验证身份，设置新密码。">
        <AuthForm mode="reset" />
        <div className="mt-4 text-sm text-slate-500">
          想起密码了？{" "}
          <a className="font-medium text-blue-700 hover:text-blue-800" href="/login">
            返回登录
          </a>
        </div>
    </AuthShell>
  );
}

import { Activity, Boxes, Cloud, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="auth-shell min-h-screen lg:grid lg:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
      <section className="auth-visual relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col xl:p-16">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-lg font-bold shadow-lg shadow-blue-950/40">Z</div>
          <div><div className="text-lg font-semibold">ZIOT Console</div><div className="text-xs text-blue-200">Device Cloud Platform</div></div>
        </div>
        <div className="relative z-10 mt-auto max-w-xl pb-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1 text-xs text-blue-100"><Cloud className="h-3.5 w-3.5" /> Connected intelligence</div>
          <h1 className="text-4xl font-semibold leading-tight xl:text-5xl">连接设备 · 智联未来</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/90">安全可靠的设备连接管理，实时监控数据状态，助力企业快速实现物联网数字化升级。</p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-xs text-white/85">
            {[{ icon: ShieldCheck, label: "安全可靠" }, { icon: Activity, label: "实时监控" }, { icon: Boxes, label: "高效管理" }].map(({ icon: Icon, label }) => <div className="flex items-center gap-2" key={label}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-400/15 text-blue-200"><Icon className="h-4 w-4" /></span>{label}</div>)}
          </div>
        </div>
        <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
      </section>
      <section className="auth-content relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-8 sm:top-8"><ThemeToggle /></div>
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">Z</div><span className="font-semibold text-slate-950">ZIOT Console</span></div>
          <div className="auth-card rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_18px_60px_rgba(30,64,175,0.12)] backdrop-blur sm:p-9">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}

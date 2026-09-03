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
    <main className="auth-shell min-h-[100dvh] lg:grid lg:grid-cols-[minmax(420px,0.92fr)_1.08fr]">
      <section className="auth-visual relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col xl:p-16">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-lg font-bold shadow-lg shadow-blue-950/40">
            Z
          </div>
          <div>
            <div className="text-lg font-semibold">ZIOT Console</div>
            <div className="text-xs text-blue-200">Device Cloud Platform</div>
          </div>
        </div>
        <div className="relative z-10 mt-auto max-w-xl pb-16 xl:pb-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1.5 text-xs font-medium tracking-wide text-blue-100">
            <Cloud className="h-3.5 w-3.5" /> 设备云管理平台
          </div>
          <h1 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight xl:text-[42px]">
            让设备运营有据可循
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-blue-50/75 xl:text-base xl:leading-7">
            在一个工作台中完成产品接入、设备状态追踪、远程控制与 OTA 发布。
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-4">
            {[
              { value: "产品", label: "设备模型与接入", icon: Boxes },
              { value: "状态", label: "实时数据与日志", icon: Activity },
              { value: "交付", label: "控制与 OTA 运维", icon: ShieldCheck },
            ].map(({ icon: Icon, value, label }) => (
              <div className="px-3" key={label}>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Icon className="h-4 w-4 text-blue-300" />
                  {value}
                </div>
                <div className="mt-1 text-xs text-blue-100/65">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-blue-100/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]" />
            面向中小型 IoT 业务的设备全生命周期管理
          </div>
        </div>
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <div className="auth-node auth-node-one" aria-hidden="true" />
        <div className="auth-node auth-node-two" aria-hidden="true" />
        <div className="auth-node auth-node-three" aria-hidden="true" />
      </section>
      <section className="auth-content relative flex min-h-[100dvh] items-start justify-center px-4 py-8 sm:items-center sm:px-8 sm:py-12">
        <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
              Z
            </div>
            <span className="font-semibold text-slate-950">ZIOT Console</span>
          </div>
          <div className="auth-card rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_18px_60px_rgba(30,64,175,0.12)] backdrop-blur sm:p-9">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </p>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}

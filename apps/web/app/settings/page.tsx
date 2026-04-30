import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { SettingsPanel } from "@/components/settings/settings-panel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const items = navItems.map((item) => ({
    ...item,
    active: item.href === "/settings"
  }));
  const config = {
    mqtt_host: process.env.MQTT_HOST ?? "localhost",
    mqtt_port: process.env.MQTT_PORT ?? "1883",
    emqx_api_url: process.env.EMQX_API_URL ?? "http://localhost:18083",
    minio_endpoint: process.env.MINIO_ENDPOINT ?? "未配置",
    minio_bucket:
      process.env.MINIO_BUCKET ?? process.env.MINIO_FIRMWARE_BUCKET ?? "未配置",
    jwt_configured: Boolean(process.env.JWT_SECRET)
  };

  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <ConsoleSidebar items={items} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">系统设置</h1>
              <p className="mt-1 text-sm text-slate-500">
                查看当前组织、MQTT、对象存储和安全配置。
              </p>
            </div>
            <div className="mt-6">
              <SettingsPanel config={config} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

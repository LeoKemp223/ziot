"use client";

import { useEffect, useState } from "react";
import { Database, LockKeyhole, RadioTower, ShieldCheck } from "lucide-react";

type SettingsConfig = {
  mqtt_host: string;
  mqtt_port: string;
  emqx_api_url: string;
  minio_endpoint: string;
  minio_bucket: string;
  jwt_configured: boolean;
};

type MeResponse = {
  code: number;
  message: string;
  data?: {
    current_org_id: string;
    organizations: Array<{
      id: string;
      name: string;
      roles: Array<{ code: string; name: string }>;
    }>;
    permissions: string[];
  };
};

export function SettingsPanel({ config }: { config: SettingsConfig }) {
  const [me, setMe] = useState<MeResponse["data"] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/v1/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<MeResponse>)
      .then((body) => {
        if (body.code !== 0 || !body.data) {
          setError(body.message);
          return;
        }

        setMe(body.data);
      })
      .catch(() => setError("请求失败，请确认 Web 服务状态。"));
  }, []);

  const currentOrg = me?.organizations.find(
    (org) => org.id === me.current_org_id
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SettingSection
        icon={<ShieldCheck className="h-5 w-5" />}
        title="组织信息"
      >
        {error ? <div className="text-sm text-rose-600">{error}</div> : null}
        <Info label="组织名称" value={currentOrg?.name ?? "-"} />
        <Info label="组织 ID" value={me?.current_org_id ?? "-"} mono />
        <Info
          label="当前角色"
          value={currentOrg?.roles.map((role) => role.name).join("、") ?? "-"}
        />
      </SettingSection>

      <SettingSection
        icon={<RadioTower className="h-5 w-5" />}
        title="MQTT 接入配置"
      >
        <Info label="MQTT Host" value={config.mqtt_host} mono />
        <Info label="MQTT Port" value={config.mqtt_port} mono />
        <Info label="EMQX API" value={config.emqx_api_url} mono />
      </SettingSection>

      <SettingSection icon={<Database className="h-5 w-5" />} title="对象存储配置">
        <Info label="MinIO Endpoint" value={config.minio_endpoint} mono />
        <Info label="Firmware Bucket" value={config.minio_bucket} mono />
      </SettingSection>

      <SettingSection
        icon={<LockKeyhole className="h-5 w-5" />}
        title="安全配置"
      >
        <Info
          label="JWT Secret"
          value={config.jwt_configured ? "已配置" : "使用本地默认值"}
        />
        <Info label="权限模型" value="组织角色 + 权限集合" />
        <Info label="普通用户隔离" value="仅访问自己创建的产品、设备和 OTA 数据" />
      </SettingSection>
    </div>
  );
}

function SettingSection({
  icon,
  title,
  children
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          {icon}
        </div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function Info({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div
        className={[
          "mt-1 break-all text-sm text-slate-900",
          mono ? "font-mono" : "font-medium"
        ].join(" ")}
      >
        {value || "-"}
      </div>
    </div>
  );
}

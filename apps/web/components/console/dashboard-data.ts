export type NavItem = {
  label: string;
  href: string;
  icon:
    | "home"
    | "box"
    | "cpu"
    | "radio"
    | "upload"
    | "logs"
    | "users"
    | "settings";
  requiredPermissions?: string[];
  active?: boolean;
};

export type DashboardStat = {
  label: string;
  value: string;
  change: string;
  tone: "blue" | "emerald" | "violet" | "amber";
  icon: "cpu" | "activity" | "database" | "alert";
};

export type RecentLog = {
  title: string;
  detail: string;
  time: string;
  level: "info" | "success" | "warning" | "danger";
};

export type AlertSummary = {
  label: string;
  value: string;
  detail: string;
  tone: "danger" | "warning" | "info";
};

export const navItems: NavItem[] = [
  { label: "首页概览", href: "/", icon: "home", active: true },
  {
    label: "产品管理",
    href: "/products",
    icon: "box",
    requiredPermissions: ["product:read"]
  },
  {
    label: "设备管理",
    href: "/devices",
    icon: "cpu",
    requiredPermissions: ["device:read"]
  },
  {
    label: "设备控制",
    href: "/controls",
    icon: "radio",
    requiredPermissions: ["device:control"]
  },
  {
    label: "OTA 升级",
    href: "/ota",
    icon: "upload",
    requiredPermissions: ["ota:read"]
  },
  {
    label: "日志中心",
    href: "/logs",
    icon: "logs",
    requiredPermissions: ["log:read"]
  },
  {
    label: "用户管理",
    href: "/users",
    icon: "users",
    requiredPermissions: ["user:read"]
  },
  {
    label: "邀请码",
    href: "/invitations",
    icon: "users",
    requiredPermissions: ["invite:read"]
  },
  {
    label: "系统设置",
    href: "/settings",
    icon: "settings",
    requiredPermissions: ["user:write"]
  }
];

export function filterNavItemsForPermissions(
  items: NavItem[],
  permissions: string[]
): NavItem[] {
  const permissionSet = new Set(permissions);

  return items.filter((item) => {
    if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
      return true;
    }

    return item.requiredPermissions.some((permission) =>
      permissionSet.has(permission)
    );
  });
}

export const dashboardStats: DashboardStat[] = [
  {
    label: "设备总数",
    value: "1,284",
    change: "+38 本周新增",
    tone: "blue",
    icon: "cpu"
  },
  {
    label: "在线率",
    value: "87.6%",
    change: "1,125 台在线",
    tone: "emerald",
    icon: "activity"
  },
  {
    label: "今日上报",
    value: "42.8万",
    change: "峰值 1,920 msg/min",
    tone: "violet",
    icon: "database"
  },
  {
    label: "今日告警",
    value: "16",
    change: "4 条待处理",
    tone: "amber",
    icon: "alert"
  }
];

export const trafficSeries = [
  32, 45, 39, 58, 62, 74, 66, 83, 78, 92, 85, 96
];

export const recentLogs: RecentLog[] = [
  {
    title: "设备上线",
    detail: "device-sh-042 通过 MQTT 完成认证",
    time: "10:42",
    level: "success"
  },
  {
    title: "控制命令回执",
    detail: "product-air-01 / set_temperature 执行成功",
    time: "10:36",
    level: "info"
  },
  {
    title: "OTA 任务分发",
    detail: "固件 v1.2.8 已推送到 24 台设备",
    time: "10:18",
    level: "info"
  },
  {
    title: "连接异常",
    detail: "gateway-hz-007 心跳超时 2 次",
    time: "09:57",
    level: "warning"
  }
];

export const alertSummaries: AlertSummary[] = [
  {
    label: "离线设备",
    value: "159",
    detail: "较昨日减少 12 台",
    tone: "warning"
  },
  {
    label: "高频失败命令",
    value: "4",
    detail: "集中在照明产品线",
    tone: "danger"
  },
  {
    label: "待升级固件",
    value: "71",
    detail: "建议分批灰度",
    tone: "info"
  }
];

export const storageUsage = {
  used: "38.4 GB",
  total: "70 GB",
  percent: 55,
  segments: [
    { label: "设备日志", percent: 31, colorClass: "bg-blue-500" },
    { label: "OTA 包", percent: 14, colorClass: "bg-emerald-500" },
    { label: "审计日志", percent: 10, colorClass: "bg-amber-500" }
  ]
};

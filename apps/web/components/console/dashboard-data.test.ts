import { describe, expect, it } from "vitest";
import {
  alertSummaries,
  dashboardStats,
  navItems,
  recentLogs,
  trafficSeries
} from "./dashboard-data";

describe("console dashboard data", () => {
  it("defines the expected primary console navigation", () => {
    expect(navItems.map((item) => item.label)).toEqual([
      "首页概览",
      "产品管理",
      "设备管理",
      "设备控制",
      "OTA 升级",
      "日志中心",
      "用户与权限",
      "系统设置"
    ]);
    expect(navItems.filter((item) => item.active)).toHaveLength(1);
  });

  it("provides dashboard summaries for the overview page", () => {
    expect(dashboardStats.map((item) => item.label)).toEqual([
      "设备总数",
      "在线率",
      "今日上报",
      "今日告警"
    ]);
    expect(trafficSeries).toHaveLength(12);
    expect(recentLogs).toHaveLength(4);
    expect(alertSummaries).toHaveLength(3);
  });
});

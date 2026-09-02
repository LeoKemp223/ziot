import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("13800000001").fill("13800000001");
  await page.getByLabel("密码").fill("Admin123456");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "控制台概览" })).toBeVisible();
}

test("console navigation reaches dashboard, control, logs and settings", async ({
  page
}) => {
  await login(page);

  await expect(page.getByText("设备总数")).toBeVisible();
  await page.goto("/controls");
  await expect(page.getByRole("heading", { name: "设备控制" })).toBeVisible();
  await expect(page.getByText("控制下发")).toBeVisible();

  await page.goto("/logs");
  await expect(page.getByRole("heading", { name: "日志中心" })).toBeVisible();
  await expect(page.getByText("条记录")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "系统设置" })).toBeVisible();
  await expect(page.getByText("MQTT 接入配置")).toBeVisible();
});

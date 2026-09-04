import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  // 登录页主题统一(ce57184)后无 placeholder,按 input name 定位(与其他 spec 一致)
  await page.fill('input[name="account"]', "13800000001");
  await page.fill('input[name="password"]', "Admin123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");
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

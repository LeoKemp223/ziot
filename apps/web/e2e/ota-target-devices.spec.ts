import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="account"]', "13800000001");
  await page.fill('input[name="password"]', "Admin123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");
}

test("ota task can target specific devices", async ({ page }) => {
  await login(page);
  await page.goto("/ota");

  // 选一个名下有设备的已发布固件,保证"指定设备"列表非空
  const firmwares = await page.request.get("/api/v1/firmwares?page_size=100");
  const firmwareBody = (await firmwares.json()) as {
    code: number;
    data?: { items: { id: string; product_id: string; status: string }[] };
  };
  const released = firmwareBody.data?.items.filter((item) => item.status === "released") ?? [];
  const withDevices: { id: string; product_id: string }[] = [];
  for (const firmware of released) {
    const devices = await page.request.get(
      `/api/v1/devices?product_id=${firmware.product_id}&page_size=100`
    );
    const deviceBody = (await devices.json()) as {
      code: number;
      data?: { items: unknown[] };
    };
    if ((deviceBody.data?.items.length ?? 0) > 0) {
      withDevices.push(firmware);
    }
  }
  test.skip(withDevices.length === 0, "没有带设备的已发布固件，跳过指定设备 e2e");

  const firmware = withDevices[0];
  if (!firmware) {
    return;
  }

  // 取该产品第一台设备的 device_key,用于验证搜索过滤
  const deviceList = await page.request.get(
    `/api/v1/devices?product_id=${firmware.product_id}&page_size=100`
  );
  const deviceBody = (await deviceList.json()) as {
    data?: { items: { id: string; device_key: string }[] };
  };
  const targetDevice = deviceBody.data?.items[0];
  expect(targetDevice).toBeTruthy();

  await page.click('button:has-text("创建任务")');
  await page.fill('input[name="name"]', "e2e 指定设备任务");
  await page.selectOption('select[name="firmware_id"]', firmware.id);
  await page.check('input[name="target_type"][value="devices"]');

  // 搜索 device_key:列表只剩匹配项;清空关键词后恢复,再搜索勾选目标设备
  const checkboxes = page.locator('div[role="dialog"] input[type="checkbox"]');
  await expect(checkboxes.first()).toBeEnabled({ timeout: 10000 });
  const total = await checkboxes.count();
  await page.fill('input[aria-label="搜索设备"]', targetDevice!.device_key);
  await expect(checkboxes).toHaveCount(1);
  await expect(page.getByText("匹配 1 台")).toBeVisible();
  await page.fill('input[aria-label="搜索设备"]', "");
  await expect(checkboxes).toHaveCount(total);
  await page.fill('input[aria-label="搜索设备"]', targetDevice!.device_key);
  await checkboxes.first().check();
  await expect(page.getByText("已选 1 台")).toBeVisible();
  await page.click('button[type="submit"]:has-text("创建任务")');

  const row = page.locator("tr", { hasText: "e2e 指定设备任务" });
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row).toContainText("指定 1 台设备");

  // 清理测试任务(created 状态需先取消再删除,否则 409)
  const taskId = await row.locator("a").getAttribute("href");
  await page.request.post(`/api/v1/ota/tasks/${taskId?.split("/").pop()}/cancel`);
  await page.request.delete(`/api/v1/ota/tasks/${taskId?.split("/").pop()}`);
});

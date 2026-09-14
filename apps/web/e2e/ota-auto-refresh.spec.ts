import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="account"]', "13800000001");
  await page.fill('input[name="password"]', "Admin123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");
}

test("ota task results auto-refresh while task is running", async ({ page }) => {
  await login(page);

  // 选一个名下有设备的已发布固件,建任务并启动(设备离线收不到回执,任务保持 running)
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
      data?: { items: { id: string }[] };
    };
    if ((deviceBody.data?.items.length ?? 0) > 0) {
      withDevices.push(firmware);
    }
  }
  test.skip(withDevices.length === 0, "没有带设备的已发布固件，跳过自动刷新 e2e");

  const firmware = withDevices[0];
  if (!firmware) {
    return;
  }

  const devices = await page.request.get(
    `/api/v1/devices?product_id=${firmware.product_id}&page_size=100`
  );
  const deviceBody = (await devices.json()) as { data?: { items: { id: string }[] } };
  const deviceId = deviceBody.data?.items[0]?.id;
  expect(deviceId).toBeTruthy();
  const created = await page.request.post("/api/v1/ota/tasks", {
    data: {
      firmware_id: firmware.id,
      name: "e2e 自动刷新任务",
      strategy: { target_type: "devices", device_ids: [deviceId] }
    }
  });
  const createdBody = (await created.json()) as { data?: { id: string } };
  const taskId = createdBody.data?.id;
  expect(taskId).toBeTruthy();
  await page.request.post(`/api/v1/ota/tasks/${taskId}/start`);

  // 任务列表页:7s 内应发生 ≥2 次任务列表轮询(间隔 5s)
  await page.goto("/ota");
  let taskPolls = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/ota/tasks?")) {
      taskPolls += 1;
    }
  });
  await page.waitForTimeout(7000);
  expect(taskPolls).toBeGreaterThanOrEqual(2);

  // 任务详情页:7s 内应发生 ≥2 次记录轮询
  await page.goto(`/ota/tasks/${taskId}`);
  let recordPolls = 0;
  page.on("request", (request) => {
    if (request.url().includes("/records?")) {
      recordPolls += 1;
    }
  });
  await page.waitForTimeout(7000);
  expect(recordPolls).toBeGreaterThanOrEqual(2);

  // 清理(先取消再删除)
  await page.request.post(`/api/v1/ota/tasks/${taskId}/cancel`);
  await page.request.delete(`/api/v1/ota/tasks/${taskId}`);
});

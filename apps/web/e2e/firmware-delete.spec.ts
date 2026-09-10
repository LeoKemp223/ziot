import { expect, test } from "@playwright/test";
import { minioAvailable } from "./minio-available";

test.skip(!minioAvailable, "MinIO 未启动，跳过固件 e2e");

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="account"]', "13800000001");
  await page.fill('input[name="password"]', "Admin123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");
}

test("firmware blocked by tasks can be deleted in-dialog", async ({ page }) => {
  const version = `v6.6.${Date.now() % 100000}`;
  await login(page);
  await page.goto("/ota");

  // 选一个有设备的产品,否则建任务会报"目标设备为空"
  const productId = await page.evaluate(async () => {
    const body = await (
      await fetch("/api/v1/products?page_size=100", { cache: "no-store" })
    ).json();
    // device_count 含软删除设备,选数量最多的产品保证有活设备
    const sorted = [...body.data.items].sort(
      (a: { device_count: number }, b: { device_count: number }) =>
        b.device_count - a.device_count
    );
    return sorted[0]?.id ?? "";
  });

  // 上传固件,自动弹出的创建任务弹窗直接提交(已预填该固件)
  await page.click('button:has-text("创建固件")');
  await page.selectOption('select[name="product_id"]', productId);
  await page.fill('input[name="version"]', version);
  await page.setInputFiles('input[name="file"]', {
    name: "e2e-blocked.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(512, 6)
  });
  await page.click('button[type="submit"]:has-text("上传并创建")');
  await page.waitForSelector('h2:has-text("创建 OTA 任务")', { timeout: 10000 });
  await page.waitForFunction(() => {
    const select = document.querySelector(
      'select[name="firmware_id"]'
    ) as HTMLSelectElement | null;
    return Boolean(select && select.value);
  });
  await page.click('button[type="submit"]:has-text("创建任务")');
  await page.waitForSelector('text=OTA 任务已创建', { timeout: 10000 });

  // 删除固件 → 被刚建的任务引用 → 弹窗列出引用任务
  const row = page.locator("tr", { hasText: version });
  await row.locator('button:has-text("删除")').click();
  await page.locator('div[role="dialog"] button:text-is("删除")').click();
  await page.waitForSelector('text=引用该固件的任务', { timeout: 10000 });

  // 新任务未结束 → 行内先取消 → 行内删除该任务
  const dialog = page.locator('div[role="dialog"]');
  await page.locator('button:has-text("先取消")').click();
  // 等弹窗内行内按钮从"先取消"变为"删除"
  await dialog.locator('button:text-is("删除")').waitFor({ timeout: 10000 });
  await dialog.locator('button:text-is("删除")').click();
  // 任务删完后底部按钮从"重试删除固件"变回"删除"
  await page.waitForSelector('button:has-text("重试删除固件")', {
    state: "detached",
    timeout: 10000
  });

  // 再点删除 → 成功
  await page.locator('div[role="dialog"] button:text-is("删除")').click();
  await page.waitForSelector('text=固件已删除', { timeout: 10000 });
  await expect(page.locator("tr", { hasText: version })).toHaveCount(0, {
    timeout: 5000
  });
});

test("firmware delete removes row from list", async ({ page }) => {
  const version = `v7.7.${Date.now() % 100000}`;
  await login(page);
  await page.goto("/ota");

  // 上传一个临时固件
  await page.click('button:has-text("创建固件")');
  await page.fill('input[name="version"]', version);
  await page.setInputFiles('input[name="file"]', {
    name: "e2e-del.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(1024, 7)
  });
  await page.click('button[type="submit"]:has-text("上传并创建")');
  // 上传成功会自动弹创建任务弹窗,关掉它
  await page.waitForSelector('h2:has-text("创建 OTA 任务")', { timeout: 10000 });
  await page.click('button[aria-label="关闭"]');

  // 找到该固件所在行
  const row = page.locator("tr", { hasText: version });
  await expect(row).toBeVisible();

  // 行内下载地址为 MinIO 预签名直链,直接 GET 应能取回上传内容
  const downloadUrl = await row.locator('a[title^="http"]').getAttribute("href");
  expect(downloadUrl).toMatch(/^http:\/\/localhost:9000\/ziot-firmwares\/firmwares\//);
  const downloaded = await fetch(downloadUrl!);
  expect(downloaded.status).toBe(200);
  expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(Buffer.alloc(1024, 7));

  await row.locator('button:has-text("删除")').click();

  // 确认弹窗
  const dialog = page.locator('div[role="dialog"]');
  await dialog.locator('button:has-text("删除")').click();
  await page.waitForSelector('text=固件已删除', { timeout: 10000 });

  // 行应消失(列表刷新)
  await expect(page.locator("tr", { hasText: version })).toHaveCount(0, {
    timeout: 5000
  });

  // 删除后对象随之清理,预签名直链不再可下载
  const afterDelete = await fetch(downloadUrl!);
  expect(afterDelete.status).toBe(404);
});

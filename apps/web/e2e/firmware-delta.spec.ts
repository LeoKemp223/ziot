import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="account"]', "13800000001");
  await page.fill('input[name="password"]', "Admin123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");
}

// detools 是差分生成的硬依赖(同 dev server 一样属于环境前提),不可用时跳过而不是报错
const detoolsAvailable =
  spawnSync(process.env.DETOOLS_BIN ?? "detools", ["--help"]).error === undefined;

test.skip(!detoolsAvailable, "detools 未安装，跳过差分固件 e2e");

test("delta firmware can be created from two binaries", async ({ page }) => {
  const stamp = Date.now() % 100000;
  const baseVersion = `vD8.0.${stamp}`;
  const targetVersion = `vD8.1.${stamp}`;
  await login(page);
  await page.goto("/ota");

  await page.click('button:has-text("差分固件")');
  await page.fill('input[name="base_version"]', baseVersion);
  await page.fill('input[name="version"]', targetVersion);
  // 两个内容不同的文件才会产出真实补丁
  await page.setInputFiles('input[name="file_base"]', {
    name: "e2e-delta-base.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(512, 6)
  });
  await page.setInputFiles('input[name="file_target"]', {
    name: "e2e-delta-target.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(512, 7)
  });
  await page.click('button[type="submit"]:has-text("生成并创建")');

  // 生成成功会自动弹创建任务弹窗,关闭后检查列表行
  await page.waitForSelector('h2:has-text("创建 OTA 任务")', { timeout: 15000 });
  await page.click('button[aria-label="关闭"]');

  const row = page.locator("tr", { hasText: targetVersion });
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row).toContainText(baseVersion);
  await expect(row).toContainText("差分");

  // 删除释放每用户 10 个固件的配额
  await row.locator('button:has-text("删除")').click();
  const dialog = page.locator('div[role="dialog"]');
  await dialog.locator('button:text-is("删除")').click();
  await page.waitForSelector("text=固件已删除", { timeout: 10000 });
  await expect(
    page.locator("tr", { hasText: targetVersion })
  ).toHaveCount(0, { timeout: 5000 });
});

test("delta firmware rejects non-bin uploads", async ({ page }) => {
  await login(page);
  await page.goto("/ota");

  await page.click('button:has-text("差分固件")');
  await page.fill('input[name="base_version"]', "vH8.0.1");
  await page.fill('input[name="version"]', "vH8.0.2");
  // 文件选择器的 accept 只过滤对话框,绕过后由服务端扩展名校验兜底
  await page.setInputFiles('input[name="file_base"]', {
    name: "firmware.hex",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(":020000040800F2\r\n", "ascii")
  });
  await page.setInputFiles('input[name="file_target"]', {
    name: "firmware.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(256, 9)
  });
  await page.click('button[type="submit"]:has-text("生成并创建")');

  await page.waitForSelector("text=基线固件文件必须为 .bin 裸二进制格式", {
    timeout: 10000
  });
  // 弹窗保持打开,任务弹窗不应出现
  await expect(
    page.locator('h2:has-text("创建 OTA 任务")')
  ).toHaveCount(0);
});

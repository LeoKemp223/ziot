import { chromium } from "@playwright/test";

// 量化 dashboard 页面的 JS 传输量(登录后整页加载 /,统计资源传输字节)
async function main() {
  const base = process.env.MEASURE_BASE_URL ?? "http://localhost:3100";
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="account"]', "13800000001");
  await page.fill('input[name="password"]', "Admin123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");

  // 禁用缓存,全新加载首页,用网络响应事件统计真实传输量(transferSize 对缓存条目记 0,不可靠)
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const responses: { url: string; size: number }[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.startsWith(base)) {
      return;
    }
    try {
      const body = await response.body();
      responses.push({ url: url.replace(`${base}/`, ""), size: body.length });
    } catch {
      // 304/流式响应等取不到 body 的忽略
    }
  });
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const total = responses.reduce((sum, item) => sum + item.size, 0);
  const js = responses.filter((item) => item.url.includes("/_next/static/") || item.url.endsWith(".js"));
  const jsBytes = js.reduce((sum, item) => sum + item.size, 0);
  console.log(
    JSON.stringify(
      {
        count: responses.length,
        totalBytes: total,
        staticJsBytes: jsBytes,
        biggest: responses
          .filter((item) => item.size > 50000)
          .sort((a, b) => b.size - a.size)
          .slice(0, 6)
      },
      null,
      2
    )
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

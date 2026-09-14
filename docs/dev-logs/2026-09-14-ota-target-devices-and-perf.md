# 2026-09-14 OTA 指定设备/结果自动刷新 + 首屏性能优化开发日志

## 背景

OTA 建任务只支持"该产品全部设备"（前端写死 `strategy: { target_type: "all" }`，后端 `resolveTargetDevices` 其实早就支持 `devices`/`group` 三种圈定）。同时任务启动后进度/记录不会自动刷新，需要手点刷新；用户还反馈"切换页面卡"。

## 方案与实现

### 1. 指定设备升级（4453902、f506f0d）

- 创建任务弹窗新增"目标范围"单选：全部设备 / 指定设备；选后者出现设备勾选列表（限高滚动 + 全选/清空）。
- 设备列表按**所选固件的产品**拉取（`/api/v1/devices?product_id=...&page_size=100`），提交时组 `strategy: { target_type: "devices", device_ids }`。
- 任务列表行加范围标签（`taskScopeLabel`：全部设备 / 指定 N 台设备 / 按设备分组）。
- 数十个设备场景补**搜索框**：按名称/device_key 前端即时过滤，标题实时显示"已选 N / 匹配 M"；**全选/清空跟随过滤语义**（清空只移除命中项，范围外已选保留）；≥100 台（接口单页上限）显示截断提示。

### 2. OTA 结果自动刷新（4453902）

参考 controls 页 5s 轮询先例，两处接入，均为**静默轮询**（`load(..., silent)` 跳过 `setLoading(true)`，不闪 loading 态/不禁用分页）：

- `/ota` 列表页：存在非终态任务时每 5s 刷新（`hasActiveTask` 门控，无任务零请求）。
- 任务详情页：任务非终态时每 5s 刷新进度卡 + 记录表；进入 finished/cancelled 自动停表。

### 3. 页面切换卡顿分析（只分析未改动）

| 场景 | 实测 |
| --- | --- |
| 路由首次访问（dev 现场编译） | 6.6s ～ 29.3s（`/` 拉了 echarts 整包最重） |
| 热路由整页 | DCL 60-80ms，networkidle ~700ms |
| 侧边栏 Link 热切换 | 55-180ms，传输 0-68KB |

结论：**非网络问题，主因是 dev 按需编译**（dev 下 `<Link>` prefetch 禁用，点谁编谁，prod build 后消失）；次因是 `usePermissions` 非 Provider，每次切页重拉 `/api/v1/me`（服务端 63-103ms/次）——量级小，暂不动。

### 4. echarts 按需引入（db1ef1c）

`dashboard-panel.tsx` 原来整包 `import * as echarts from "echarts"`，首页只用了柱状图 + grid/legend/tooltip。改 `echarts/core` 按需注册后 prod 实测：**静态 JS 1.66MB → 1.05MB（-36%），最大 chunk 1.13MB → 520KB（-54%）**。

## 踩坑

- **`event.currentTarget` 在异步 state updater 里为 null**：勾选框 `onChange={(e) => setX(cur => e.currentTarget.checked ? ...)}` 直接 Runtime TypeError（React 事件派发完就置空 currentTarget）。必须在 updater 外同步取 `const checked = e.currentTarget.checked`。e2e 抓出来的，typecheck 查不出。
- **useEffect 依赖数组放数组引用 = 竞态**：设备列表 effect 依赖 `allFirmwares`，初始 `load()` 返回新数组引用就重跑 effect、清掉用户刚勾的设备。改依赖**解析出的原始值**（`selectedProductId` 字符串），列表刷新不再误伤勾选。
- **e2e 环境被固件配额卡死**：每用户 10 个固件上限，历史 smoke 测试残留 7 个固件 + 6 个任务没清，`firmware-delete/delta` spec 全挂在"配额已满 → 上传失败 → 弹窗不弹"。清理姿势：**created 状态任务直接 DELETE 会 409，必须先 cancel 再 delete**；固件被任务引用时也要先删任务。今后 smoke/e2e 建议自清理。
- **传输量统计别信 `transferSize`**：缓存命中的资源条目 transferSize 记 0（连 `Network.setCacheDisabled` 都拦不住 disk cache 的记账）。可靠做法：CDP 禁缓存 + `page.on("response")` 累加 `response.body().length`。
- **Turbopack 的 `next build` 不打印路由体积表**（无 First Load JS 列），量化要起 prod server 实测，沉淀成了 `scripts/measure-dashboard-bytes.ts`。
- **`next-env.d.ts` 别提交**：其中 routes.d.ts 引用路径在 `.next/dev/types`（dev）与 `.next/types`（build）之间翻转，跑完 build 记得 `git checkout --` 还原。

## 新增/改动代码

| 文件 | 改动 |
| --- | --- |
| `apps/web/components/ota/ota-console-panel.tsx` | 目标范围单选 + 设备勾选列表 + 搜索过滤 + 全选语义 + 截断提示；任务列表范围标签；有非终态任务时 5s 静默轮询 |
| `apps/web/components/ota/ota-task-detail-panel.tsx` | 任务非终态时 5s 静默轮询进度/记录 |
| `apps/web/components/dashboard/dashboard-panel.tsx` | echarts 按需注册（Bar/Grid/Legend/Tooltip/Canvas） |
| `apps/web/e2e/ota-target-devices.spec.ts` | 新增。指定设备建任务全链路 + 搜索过滤断言 |
| `apps/web/e2e/ota-auto-refresh.spec.ts` | 新增。运行中任务 7s 内 ≥2 次轮询断言（列表页 + 详情页） |
| `scripts/measure-dashboard-bytes.ts` | 新增。Playwright + CDP 禁缓存的页面传输量测量脚本 |

## 测试

- typecheck 全绿；OTA 相关 5 个 e2e（console-smoke / firmware-delete×2 / firmware-delta×2 + 新增 2 个）全过。
- echarts 改动在 prod build 起服后验证 canvas 正常渲染 + console-smoke 通过；优化前后传输量见上。
- e2e 均自清理（cancel→delete），本轮结束后 `ota_tasks`/固件零残留。

## 后续可做

- OTA 圈定支持"设备分组"（`target_type: group` 后端现成，缺 UI）。
- `usePermissions` 提升为全局 Context Provider，消掉每页一次的 `/api/v1/me`（收益小，优先级低）。
- 设备选择器超过 100 台时可考虑接搜索型远程查询（当前前端过滤 + 截断提示够用）。

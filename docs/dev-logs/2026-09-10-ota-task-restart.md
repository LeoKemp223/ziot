# 2026-09-10 OTA 任务终态后重新启动 开发日志

## 背景

OTA 任务此前是一次性的：`startOtaTask` 仅允许 `created/scheduled` 启动，到 `finished/cancelled` 后只能删除。实际运维需要"部分设备升级失败/任务误取消后，对未成功设备重试"——原来只能整任务重建。

## 方案决策

1. **不新增端点**：扩展 `POST /api/v1/ota/tasks/{id}/start`，`finished/cancelled` 视为重启（`ota:execute` 权限与 `ota.start` 审计复用）；`running` 等中间态仍拒绝。
2. **重试未完成语义，非全量重推**：重启只重置 `success` 以外的记录（失败/已取消，含理论上残留的非终态）为 `notified`（进度归零、清 `error_message`/`finished_at`），且**仅向这些设备**重新发布 MQTT notify；已成功记录不动（全量重新下发 = 新建任务）。
3. 全部记录已 `success` 时返回 `409001`"所有设备均已升级成功，无需重新启动；如需重新下发请新建任务"。
4. 任务 update 无条件写 `finished_at: null`（重启清掉上次结束时间；首启本就为 null，无需条件分支）。
5. **下发集合与重置集合严格一致**：初启按 `status in [created,scheduled]`、重启按 `status != success` 过滤 `started.records`（update include 的是 updateMany 前状态，过滤即得重置集）——不变式"恰好向被重置的设备下发"。
6. `packages/domain/ota-state.ts` 不动：它建模设备驱动进度且实际未被 `recordOtaProgress` 消费，重启是平台侧批量重置。
7. UI：任务列表终态行新增"重新启动"（`canExecuteOta` 且 `success < total`，隐藏条件仅 UX 优化、服务端 409001 是准绳）；任务详情头部补齐"启动任务"（created/scheduled）与"重新启动"按钮。

## 关键交互

- 重启后 `recordOtaProgress` 的"升级记录已取消"拒绝不再生效（记录已重置 `notified`），被取消设备可继续上报。
- `finishTaskIfComplete` 对重启任务照常收敛：全部记录回终态后任务再次 `finished`。
- `deleteOtaTask` 仍要求终态：重启中的任务回到 `running`，需再取消/完成才能删，语义自洽。

## 新增/改动代码

| 文件 | 改动 |
| --- | --- |
| `apps/web/features/ota/ota-service.ts` | `startOtaTask`：restart 守卫 + 全 success 拒绝 + updateMany 双分支 where + 清 error/finished_at + 下发集合过滤 |
| `apps/web/components/ota/ota-console-panel.tsx` | 任务列表终态行加 重新启动 按钮（复用 startTask） |
| `apps/web/components/ota/ota-task-detail-panel.tsx` | 引入 usePermissions/startTask，头部按钮区分 启动任务/重新启动 |
| `docs/api/admin-api.md` | start 节补"启动前状态限制与重新启动语义"，cancel 节交叉引用 |

## 测试

- 单测新增 4 例（ota-service.test.ts）：cancelled 任务混合记录重启（updateMany 范围/清空字段/仅重置设备收到 topic）、全 success 拒绝、running 仍拒绝（守卫回归）、初启范围不变（stray success 不重发）。
- 既有 3 个 notify-payload 用例 fixture 的记录状态从 `notified` 修正为 `created`（首启前记录必为 created，原 fixture 状态在真实流程中不可能出现）。
- 手动：建任务→启动→取消→重新启动→确认仅未成功设备收到 notify、被取消记录可再上报、全 success 后按钮消失且 API 返回 409001。

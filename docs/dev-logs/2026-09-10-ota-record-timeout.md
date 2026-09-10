# 2026-09-10 OTA 记录超时兜底 开发日志

## 背景

OTA 任务"进行中"不占任何进程（启动是同步请求，收敛靠设备上报触发 `finishTaskIfComplete`），但设备失联/不上报时任务永远停在 `running`：dashboard 虚高、任务与固件删不掉。worker 已有命令超时扫描（`control/expire-commands`），OTA 缺同款兜底。

## 方案决策

1. **worker 定时扫描**（`ota/expire-ota-records.ts`，仿 `expire-commands`/`retention` 惯例）：超过 `OTA_RECORD_TIMEOUT_HOURS`（默认 24h）`updated_at` 无动静的非终态记录翻 `failed("升级超时：设备长时间未上报进度")` + 写 `finished_at`；启动即扫一次，尽快收敛积压僵尸。
2. **以 updated_at 为超时基准**：设备每次上报都会刷新 `updated_at`，语义即"持续 N 小时无动静"，而非"启动后 N 小时"——反复缓慢上报的设备不会被误杀。
3. **先圈定受影响任务再写**：findMany distinct task_id → 记录 updateMany 限定 `task_id in ids` → 任务 updateMany 限定 `id in ids AND status=running AND records:none 非终态`。不做全局任务收敛扫描，避免波及刚启动/重启中的任务（重启会把记录重置 `notified`，`records:none` 条件不成立即跳过）。
4. 任务收敛条件与 web 侧 `finishTaskIfComplete` 完全一致（无非终态记录 → finished）。

## 新增/改动代码

| 文件 | 改动 |
| --- | --- |
| `apps/worker/src/ota/expire-ota-records.ts` | 新增。`expireStaleOtaRecords(db)`（db 参数便于单测）+ `startOtaRecordExpiry()` interval 启动器 |
| `apps/worker/src/index.ts` | 挂载/清理 timer |
| `docs/api/admin-api.md` | cancel 节后补"升级超时兜底"说明 |

## 测试

- 单测 3 例：过期记录翻 failed + 受影响任务收敛（断言 where 限定与 records:none 条件）、无过期记录零写入、`OTA_RECORD_TIMEOUT_HOURS` 阈值生效。
- 真实栈验证：造僵尸记录（SQL 把记录 updated_at 拨回 25h 前）→ 手动触发扫描 → 记录变 failed(升级超时)、任务自动 finished。

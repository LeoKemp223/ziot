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

## 踩坑：psql 直改时间与 prisma 查询对不上

本地 PG 时区是 Asia/Shanghai，而 `@prisma/adapter-pg` 读写 timestamptz 用的是**裸 UTC 墙钟字符串**（写入的真实时刻比 +08 墙钟早 8h 落库，读出再 +8h 还原）——纯 prisma 链路完全自洽、UI 显示也正确。但用 psql 直写"真实时刻"（如 `updated_at = now() - interval '25 hours'`）后，prisma 的 where 时间比较会差 8 小时对不上，扫描一度返回 0。让 psql 写出 prisma 语义的时间要：

```sql
update ota_records set updated_at = (now() - interval '25 hours') at time zone 'utc' ...
```

生产 Docker 的 PG 若配 UTC 则无此现象。教训：**调试时给 prisma 查询造时间数据，要么走 prisma 自己写，要么 psql 里显式 `at time zone 'utc'`**。

## 测试

- 单测 3 例：过期记录翻 failed + 受影响任务收敛（断言 where 限定与 records:none 条件）、无过期记录零写入、`OTA_RECORD_TIMEOUT_HOURS` 阈值生效。
- 真实栈验证：造僵尸记录（按 prisma 语义回拨 updated_at 25h）→ 手动触发扫描 → 记录变 failed(升级超时)、任务自动 finished；重写模块后复测一次同样通过。

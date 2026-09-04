# 2026-09-04 差分固件（Delta OTA）功能开发日志

## 背景

STM32 场景省流量需求：控制台一次上传 V1/V2 两个固件，平台生成差分补丁，设备下载补丁本地重组，走既有 OTA 任务链路。

已确认的方案决策：

1. 差分格式选 **bsdiff + heatshrink**（方案 A），工具用 **detools**——Espressif 官方 `esp_delta_ota_patch_gen` 内部即 `detools.create_patch(compression='heatshrink')`，格式同源；detools 自带面向嵌入式的 C patch 应用库（数百字节 RAM + heatshrink 解码器），STM32 侧可移植。
2. 生成在 API 路由内**同步**完成（≤5MB 固件实测 <0.1s，超时上限 120s），不上 worker 队列。
3. 不加 `package_type` 枚举列——`base_version != null` ⇔ 差分包；不建新表；整包上传路径不动。
4. 不做按设备 `firmware_version` 选包：notify payload 附加差分字段，设备端 bootloader 自校验当前版本是否等于 `base_version`。
5. V1/V2 原始 bin 不保留（生成后即删），且临时文件放 `os.tmpdir()`——`public/` 是无鉴权静态目录，中间态不能落那里。

## 数据模型

`Firmware` 加 3 个可空列：`base_version`（基线版本 V1）、`target_sha256`（V2 全量文件 sha256）、`patch_format`（`"bsdiff-heatshrink"`）。

`@@unique([product_id, version])` → `@@unique([product_id, version, base_version])`。

**NULLS DISTINCT 陷阱**：Postgres 默认可空列唯一索引里 NULL 互不相等，改 3 列后"整包防重"在 DB 层失效（两条 `(P, v2.0, NULL)` 不冲突）。应用层 `findFirst` 查重本就是真正的守门（现状即如此），改后整包查重带 `base_version: null` 作用域、差分查重带具体 base_version，DB 约束只兜底非空组合。`db push` 时 Prisma 会因"新增唯一约束可能撞重复"要求 `--accept-data-loss`，属误报（存量行 base_version 全 NULL，不可能违反）。

迁移链按惯例补文件（本地只 db push）：

```bash
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot \
  pnpm --filter @ziot/db exec prisma db push --schema prisma/schema.prisma --accept-data-loss
git show HEAD:packages/db/prisma/schema.prisma > /tmp/schema_old.prisma
cd packages/db && pnpm exec prisma migrate diff \
  --from-schema /tmp/schema_old.prisma --to-schema prisma/schema.prisma --script \
  -o prisma/migrations/20260904100000_add_firmware_delta_columns/migration.sql
pnpm --filter @ziot/db prisma:generate
```

## detools 工具链（踩坑）

- **detools 是 sdist-only**：PyPI 无 wheel，自带 C 扩展 `detools.suffix_array`（SA-IS 后缀排序，bsdiff 创建端），装它必须编译 → 需要 Python 头文件。依赖包 bsdiff4/heatshrink2 有 musllinux wheel，但 detools 本身总是从源码构建。
- **本地免 root**：机器无 `python3-dev`（无 `Python.h`），`pip3 install --user detools` 构建失败。解法：**uv**（单文件、免 root）+ uv 托管 Python（自带头文件）：

  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  uv tool install --python 3.12 detools   # → ~/.local/bin/detools
  ```

- **Docker**（`deploy/Dockerfile.prod`）：build 阶段 `apk add python3 py3-pip python3-dev build-base` + venv 装到 `/opt/detools`，runtime 阶段只 `apk add python3` + 拷 venv（两阶段路径一致保 shebang 有效），镜像内 `ENV DETOOLS_BIN=/opt/detools/bin/detools`（web/worker 共用，compose 无需再配）。
- Web 侧通过 `DETOOLS_BIN` 环境变量定位（默认 `detools` 走 PATH），`spawn` 参数数组、无 shell、超时 SIGKILL。
- round-trip 验证：256KB 随机 bin + 16 字节改动 → 补丁 4KB，create 0.08s，`apply_patch` 还原 cmp 一致。

## 新增/改动代码

| 文件 | 内容 |
| --- | --- |
| `apps/web/features/ota/firmware-patch.ts`（新） | `PATCH_FORMAT` 常量、`patchToolBin()`、`runPatchTool()` spawn 封装（超时/ENOENT/退出码错误契约，500001） |
| `apps/web/features/ota/ota-service.ts` | `mapFirmware` 透出 3 字段；`createFirmware` 查重带 `base_version: null`；新增 `createDeltaFirmware`（版本相等/查重/配额/sha256 校验）；`otaNotifyPayload` 差分时附加 `package_type`/`base_version`/`target_sha256`/`patch_format` |
| `apps/web/app/api/v1/firmwares/delta/route.ts`（新） | multipart 双文件 → mkdtemp 临时目录 → runPatchTool → 补丁落 `public/uploads/firmwares/`（`{uuid}-delta-{base}-{target}.patch`，命中删除正则）→ `firmware.delta.create` 审计；finally 必清临时目录 |
| `apps/web/components/ota/ota-console-panel.tsx` | 「差分固件」按钮 + 弹窗（base_version/version/两文件/release_note），版本列显示 `V1 → V2` + 差分徽标 |
| `apps/web/e2e/firmware-delta.spec.ts`（新） | 探测 detools 不可用即 skip；上传→徽标断言→删除释放配额 |

下游零改动：`startOtaTask`/EMQX webhook/`recordOtaProgress`（成功后 `device.firmware_version` 回写 = V2）对差分透明。

## 补充决策：仅支持 .bin（2026-09-04）

用户确认差分输入只收 `.bin` 裸二进制，不做 hex 转换：文件名（忽略大小写）不以 `.bin` 结尾返回 `400001`（前端 accept 同步收敛为 `.bin`）。原因：差分补丁针对的是设备 flash 里的原始镜像，hex 是带地址/校验和的文本封装，两者不对应；需要差分的 hex 用户自行转 bin 再上传（整包上传路径不受影响，hex 整包 OTA 由设备端自行解析）。

## 设备端（STM32）对接指引

- notify payload 差分时：`sha256` = **补丁**校验值；`target_sha256` = 重组出的 **V2** 校验值。流程：校验自身版本 == `base_version` → GET `file_url` → 校验补丁 `sha256` → 应用补丁（bsdiff+heatshrink）→ 校验产物 == `target_sha256` → 写入/切换启动；版本不匹配或无解补丁能力应上报失败。
- patch 应用实现参考：detools 仓库 `c/` 目录（独立 C，增量流式，RAM 数百字节 + heatshrink 解码器）；esp_delta_ota（Apache-2.0）为同格式的 ESP-IDF 参考实现。
- **硬约束**：bspatch 打补丁时旧镜像必须完整在位 → 需双 bank flash 或外置 SPI flash 暂存，单 bank 原地覆盖做不了差分；不带解补丁能力的存量设备请继续用整包固件。

## 测试

- 单测 `firmware-patch.test.ts`（5）：spawn 参数/DETOOLS_BIN 覆写/非零退出带 stderr/超时 SIGKILL/ENOENT 提示安装。
- 单测 `ota-service.test.ts` 扩展（+7）：createDeltaFirmware happy path、base==target、重复、配额、非法 sha256、整包查重作用域、notify payload 差分字段有/无。
- e2e `firmware-delta.spec.ts`：detools 缺失自动 skip；完整弹窗→生成→徽标→删除链路。

## 设备端 C demo（docs/device-integration/delta-ota-demo/）

给固件团队验证平台补丁用的 PC 端参考实现，模拟 STM32 bootloader 完整流程：流式下载（补丁不整体落盘）→ heatshrink 解码 → detools sequential 语义重组（diff/extra/adjust）→ 页缓存写 bank B（补 0xFF）→ 双 sha256 校验。移植只需替换 3 处平台函数（fetch/read_old/program_page）。

- **格式实证**：补丁 = `0x04` 头 + varint to_size + heatshrink 参数字节 + heatshrink 位流（标志位 1=字面/0=反引用，距离=index+1，长度=count+1，MSB-first）；命令流 = varint(0) + 循环{diff,extra,adjust}。以 detools/heatshrink2 的 Python 源码 + heatshrink 原版 C 解码器实测为准（手推位流曾出错，勿凭记忆实现）。
- heatshrink 解码器直接 vendored 原版 atomicobject 实现（ISC 许可，与 detools、esp_delta_ota 同源），非重写。
- **踩坑**：sink 死循环——decoder 输入缓冲满时 `heatshrink_decoder_sink` 返回 sinked=0，必须用 pending 缓冲保存未消费字节、poll 消化后再喂，不能在 fetch 内重试。
- 闭环验证：64KB 真实固件对（cmp 一致）、512KB（补丁 9.3KB=1.8%）、64B 极小固件 + `--chunk 1` 极端流式、错误基线（exit 4）/篡改补丁（exit 2）/截断补丁（exit 2）全部正确；内置流式 sha256 与 sha256sum 对拍一致。
- RAM 预算：< 4KB（heatshrink 窗口 2^8 + 页缓存 2048B + 命令缓冲 256B）。

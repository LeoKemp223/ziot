# 差分 OTA 设备端验证 demo(C)

在 PC 上模拟 STM32 bootloader 应用平台差分补丁的完整流程,用于:

- 验证平台生成的 `.patch`(detools bsdiff+heatshrink)设备端可以正确重组
- 作为 bootloader 集成的参考实现——移植时只需替换 3 处平台函数(见下文)

## 构建与闭环验证

```bash
cd docs/device-integration/delta-ota-demo
gcc -O2 -Wall delta_ota_demo.c heatshrink_decoder.c -o delta_ota_demo

# 1. 造两个版本的固件(模拟 V1 → V2:局部修改 + 尾部追加)
head -c 65536 /dev/urandom > v1.bin
python3 - <<'EOF'
data = bytearray(open("v1.bin", "rb").read())
data[1000:1100] = bytes(100)
data[30000:30050] = b"ZIOT-DELTA-OTA-TEST"
open("v2.bin", "wb").write(bytes(data) + b"APPEND-TAIL" + bytes(data[5000:5500]))
EOF

# 2. 用平台同款工具生成补丁(平台内部即此命令)
detools create_patch --compression heatshrink v1.bin v2.bin p.patch

# 3. demo 重组:基线 + 补丁 → 重组镜像,双重 sha256 校验
./delta_ota_demo v1.bin p.patch out.bin "$(sha256sum v2.bin | cut -d' ' -f1)" \
  --patch-sha "$(sha256sum p.patch | cut -d' ' -f1)"

# 4. 字节级比对
cmp v2.bin out.bin && echo OK
```

对平台真实产物验证:在控制台「差分固件」上传 V1/V2 后,用固件列表里的
`file_url` 下载补丁,`sha256` 列作为 `--patch-sha`,任务 notify payload 里的
`target_sha256` 作为第 4 个参数即可。

## 用法

```
./delta_ota_demo <v1.bin> <patch.bin> <out.bin> <target_sha256_hex>
                 [--patch-sha <hex>] [--chunk 512] [--page 2048]
```

| 参数 | 说明 |
| --- | --- |
| `--patch-sha` | notify payload 的 `sha256`(补丁文件校验值),提供则校验 |
| `--chunk` | 模拟 HTTP 下载的分包大小(演示流式喂入,补丁不需整体落盘) |
| `--page` | 模拟 flash 页大小(页缓存写满才"编程",页尾补 0xFF) |

退出码:`0` 成功 / `1` 参数文件错误 / `2` 补丁格式或数据错误 / `3` 补丁 sha256 不匹配 / `4` 目标 sha256 不匹配(基线不是补丁对应的 V1)。

## 补丁格式(detools sequential + heatshrink)

```
[1B]   0x04 = (patch_type=0 sequential << 4) | (compression=4 heatshrink)
[varint] 目标固件大小 to_size
[1B]   heatshrink 参数:((window_sz2-4) << 4) | (lookahead_sz2-3)
[位流] heatshrink 压缩的命令流(原版 atomicobject 格式,MSB-first:
       标志位 1=字面量+8bit;0=反引用 window 位 index + lookahead 位 count,
       距离=index+1,长度=count+1)
```

命令流解压后(`varint`:首字节 bit7=续位、bit6=符号、低 6 位起):

```
[varint] data_format 长度(平台恒为 0)
循环直到产出 to_size 字节:
  [varint] diff 长度 n      → n 字节与旧镜像逐字节相加(mod 256),旧游标前进 n
  [varint] extra 长度 m     → m 字节字面输出
  [varint] 有符号调整量 a    → 旧镜像游标 += a
```

## 移植到 STM32

demo 按生产形态组织,移植只改三处(文件里已标注「平台相关①②③」):

| demo 函数 | STM32 实现 |
| --- | --- |
| `patch_stream_fetch()` | `fread` → HTTP/AT 逐包收(或从 SPI flash 读暂存的补丁) |
| `flash_read_old()` | 内存数组 → 直接读 bank A,XIP 零成本:`(const uint8_t *)0x08000000 + offset` |
| `flash_program_page()` | memcpy 页缓存 → 先擦后写 + 双字编程(`HAL_FLASH_Program`),页尾补 0xFF |

要点:

- **双 bank(或外置 flash)是硬约束**:bspatch 重组时旧镜像必须在位,单 bank 原地覆盖做不到
- 补丁无需整体落盘:heatshrink 解码器增量消费,`--chunk 1` 极端流式已验证可行
- RAM 预算:heatshrink 解码器 ≈ 窗口 2^8 + 输入缓冲 + 状态 ≈ **600 字节**,加页缓存(2048B)与命令缓冲(256B)合计 **< 4KB**
- heatshrink_decoder.c 关闭动态分配:置 `heatshrink_config.h` 的 `HEATSHRINK_DYNAMIC_ALLOC` 为 0(用静态缓冲,尺寸由 `HEATSHRINK_STATIC_*` 决定,静态段更贴合 MCU)
- 流式模式下补丁 sha256 在下载完成时才知道,因此**最终防线是 target_sha256**(重组结果校验,不通过则丢弃 bank B、保持 bank A,上报 failed)
- 校验语义:notify 的 `sha256` = 补丁文件;`target_sha256` = 重组出的 V2 镜像;版本自校验(自身版本 == `base_version`)后才开始下载

## 文件与许可

- `delta_ota_demo.c` — 流程与格式处理(本仓库,含内置流式 sha256)
- `heatshrink_decoder.{c,h}`、`heatshrink_common.h`、`heatshrink_config.h` — 原版 [atomicobject/heatshrink](https://github.com/atomicobject/heatshrink) 解码器(ISC 许可,见 `heatshrink-LICENSE`),与平台 detools、ESP-IDF esp_delta_ota 使用同一实现

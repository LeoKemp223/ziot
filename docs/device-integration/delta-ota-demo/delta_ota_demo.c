/*
 * delta_ota_demo.c — STM32 差分 OTA 设备端流程演示(PC 上运行)
 *
 * 模拟 bootloader 应用平台(detools bsdiff+heatshrink)生成的差分补丁的完整流程:
 *
 *   1. 流式下载补丁(按 chunk 喂入,模拟 HTTP 下载),边下边算补丁 sha256
 *   2. 校验补丁头(sequential + heatshrink)与目标固件大小
 *   3. heatshrink 解码命令流(原版 atomicobject 解码器,见 heatshrink_decoder.c)
 *   4. 按 detools sequential 语义应用:diff(与 bank A 旧镜像逐字节相加) / extra(字面) / adjust(旧镜像游标调整)
 *   5. 产出字节按"页缓冲"写入 bank B(模拟先擦后写、双字编程、页尾补 0xFF),边写边算目标 sha256
 *   6. 校验重组结果 == notify payload 里的 target_sha256,通过后落盘 out.bin
 *
 * 移植到 STM32 时替换三处平台相关函数即可:
 *   - patch_stream_fetch(): fread → HTTP/AT 收包;     (或 SPI flash 读暂存补丁)
 *   - flash_read_old():     内存数组 → 直接读 bank A (XIP, (const uint8_t*)0x080xxxxx + offset)
 *   - flash_program_page(): memcpy 页缓存 → HAL_FLASH_Program 双字编程
 *
 * 用法:
 *   ./delta_ota_demo <v1.bin> <patch.bin> <out.bin> <target_sha256_hex>
 *                    [--patch-sha <hex>] [--chunk 512] [--page 2048]
 *
 * 退出码: 0 成功; 1 参数/文件错误; 2 补丁格式错误; 3 补丁 sha256 不匹配; 4 目标 sha256 不匹配
 *
 * 依赖: heatshrink_decoder.c(原版,ISC 许可,见 heatshrink-LICENSE)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "heatshrink_decoder.h"

/* ============================ sha256(流式,公共域实现风格) ============================ */

typedef struct {
    uint32_t state[8];
    uint64_t bitlen;
    uint8_t buf[64];
    size_t buflen;
} sha256_ctx;

static const uint32_t sha256_k[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

#define SHA_ROTR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

static void sha256_compress(sha256_ctx *ctx, const uint8_t p[64]) {
    uint32_t w[64], a, b, c, d, e, f, g, h, t1, t2;
    int i;

    for (i = 0; i < 16; i++) {
        w[i] = ((uint32_t)p[i * 4] << 24) | ((uint32_t)p[i * 4 + 1] << 16) |
               ((uint32_t)p[i * 4 + 2] << 8) | (uint32_t)p[i * 4 + 3];
    }
    for (i = 16; i < 64; i++) {
        uint32_t s0 = SHA_ROTR(w[i - 15], 7) ^ SHA_ROTR(w[i - 15], 18) ^ (w[i - 15] >> 3);
        uint32_t s1 = SHA_ROTR(w[i - 2], 17) ^ SHA_ROTR(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }

    a = ctx->state[0]; b = ctx->state[1]; c = ctx->state[2]; d = ctx->state[3];
    e = ctx->state[4]; f = ctx->state[5]; g = ctx->state[6]; h = ctx->state[7];

    for (i = 0; i < 64; i++) {
        uint32_t S1 = SHA_ROTR(e, 6) ^ SHA_ROTR(e, 11) ^ SHA_ROTR(e, 25);
        uint32_t ch = (e & f) ^ (~e & g);
        t1 = h + S1 + ch + sha256_k[i] + w[i];
        uint32_t S0 = SHA_ROTR(a, 2) ^ SHA_ROTR(a, 13) ^ SHA_ROTR(a, 22);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        t2 = S0 + maj;
        h = g; g = f; f = e; e = d + t1;
        d = c; c = b; b = a; a = t1 + t2;
    }

    ctx->state[0] += a; ctx->state[1] += b; ctx->state[2] += c; ctx->state[3] += d;
    ctx->state[4] += e; ctx->state[5] += f; ctx->state[6] += g; ctx->state[7] += h;
}

static void sha256_init(sha256_ctx *ctx) {
    ctx->state[0] = 0x6a09e667; ctx->state[1] = 0xbb67ae85;
    ctx->state[2] = 0x3c6ef372; ctx->state[3] = 0xa54ff53a;
    ctx->state[4] = 0x510e527f; ctx->state[5] = 0x9b05688c;
    ctx->state[6] = 0x1f83d9ab; ctx->state[7] = 0x5be0cd19;
    ctx->bitlen = 0;
    ctx->buflen = 0;
}

static void sha256_update(sha256_ctx *ctx, const uint8_t *data, size_t len) {
    ctx->bitlen += (uint64_t)len * 8;

    while (len > 0) {
        size_t take = 64 - ctx->buflen;
        if (take > len) take = len;
        memcpy(ctx->buf + ctx->buflen, data, take);
        ctx->buflen += take;
        data += take;
        len -= take;
        if (ctx->buflen == 64) {
            sha256_compress(ctx, ctx->buf);
            ctx->buflen = 0;
        }
    }
}

static void sha256_final(sha256_ctx *ctx, uint8_t out[32]) {
    uint64_t bitlen = ctx->bitlen;
    uint8_t pad = 0x80;
    int i;

    sha256_update(ctx, &pad, 1);
    uint8_t zero = 0;
    while (ctx->buflen != 56) sha256_update(ctx, &zero, 1);

    uint8_t len_bytes[8];
    for (i = 0; i < 8; i++) len_bytes[i] = (uint8_t)(bitlen >> (56 - i * 8));
    ctx->bitlen = bitlen; /* update 中会被加长,这里只是补长度块 */
    for (i = 0; i < 8; i++) {
        ctx->buf[56 + i] = len_bytes[i];
    }
    sha256_compress(ctx, ctx->buf);

    for (i = 0; i < 8; i++) {
        out[i * 4] = (uint8_t)(ctx->state[i] >> 24);
        out[i * 4 + 1] = (uint8_t)(ctx->state[i] >> 16);
        out[i * 4 + 2] = (uint8_t)(ctx->state[i] >> 8);
        out[i * 4 + 3] = (uint8_t)ctx->state[i];
    }
}

static void sha256_hex(const uint8_t digest[32], char out[65]) {
    static const char hexdigits[] = "0123456789abcdef";
    int i;

    for (i = 0; i < 32; i++) {
        out[i * 2] = hexdigits[digest[i] >> 4];
        out[i * 2 + 1] = hexdigits[digest[i] & 0xf];
    }
    out[64] = '\0';
}

static int parse_sha256_hex(const char *hex, uint8_t out[32]) {
    int i;

    if (strlen(hex) != 64) return -1;
    for (i = 0; i < 64; i++) {
        char c = hex[i];
        int v;

        if (c >= '0' && c <= '9') v = c - '0';
        else if (c >= 'a' && c <= 'f') v = c - 'a' + 10;
        else if (c >= 'A' && c <= 'F') v = c - 'A' + 10;
        else return -1;

        if (i % 2 == 0) out[i / 2] = (uint8_t)(v << 4);
        else out[i / 2] |= (uint8_t)v;
    }
    return 0;
}

/* ============================ 补丁流(模拟 HTTP 下载 + heatshrink 解压) ============================ */

#define PATCH_FORMAT_HEADER 0x04 /* (patch_type=0 sequential << 4) | (compression=4 heatshrink) */

typedef struct {
    /* 平台相关①:PC demo 用文件;STM32 换成 HTTP/AT 收包或 SPI flash 读 */
    FILE *file;
    long file_size;
    long fetched;              /* 已"下载"字节数 */
    size_t chunk_size;         /* 模拟下载 chunk */

    uint8_t expect_patch_sha_given;
    uint8_t expect_patch_sha[32];
    sha256_ctx patch_sha;      /* 边下边算:补丁文件整体 sha256 */

    heatshrink_decoder *hsd;
    /* 从文件读出但 heatshrink 输入缓冲装不下、暂存的字节(不丢字节) */
    uint8_t pend[512];
    size_t pend_len;
} patch_stream_t;

typedef struct {
    uint8_t *data;
    size_t size;
} bin_t;

static int load_bin(const char *path, bin_t *out) {
    FILE *f = fopen(path, "rb");

    if (!f) {
        fprintf(stderr, "无法打开 %s\n", path);
        return -1;
    }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (size < 0) { fclose(f); return -1; }

    out->data = (uint8_t *)malloc(size ? (size_t)size : 1);
    if (!out->data) { fclose(f); return -1; }
    if (size && fread(out->data, 1, (size_t)size, f) != (size_t)size) {
        fclose(f);
        free(out->data);
        return -1;
    }
    fclose(f);
    out->size = (size_t)size;
    return 0;
}

/* 从补丁文件再取一个 chunk:先把 pending 喂进 decoder,再读文件;装不下的留 pending。
 * 返回本次从文件新读到的字节数,0 表示文件已尽。 */
static size_t patch_stream_fetch(patch_stream_t *ps) {
    size_t want = ps->chunk_size;
    size_t got = 0;

    /* 先把 pending 喂进 decoder(可能上一轮输入缓冲满留下的) */
    while (ps->pend_len > 0) {
        size_t took = 0;
        HSD_sink_res res = heatshrink_decoder_sink(ps->hsd, ps->pend, ps->pend_len, &took);

        if (res < 0) {
            fprintf(stderr, "heatshrink sink 失败(%d)\n", res);
            return 0;
        }
        if (took == 0) break; /* 输入缓冲满,等 poll 消化后再来 */
        memmove(ps->pend, ps->pend + took, ps->pend_len - took);
        ps->pend_len -= took;
    }

    if (ps->fetched >= ps->file_size) return 0;
    if ((long)(ps->file_size - ps->fetched) < (long)want) {
        want = (size_t)(ps->file_size - ps->fetched);
    }
    if (want > sizeof(ps->pend) - ps->pend_len) {
        want = sizeof(ps->pend) - ps->pend_len;
    }
    got = fread(ps->pend + ps->pend_len, 1, want, ps->file);
    if (got == 0) return 0;

    ps->fetched += (long)got;
    ps->pend_len += got;
    sha256_update(&ps->patch_sha, ps->pend + ps->pend_len - got, got);

    /* 立即尝试 sink 一轮 */
    while (ps->pend_len > 0) {
        size_t took = 0;
        HSD_sink_res res = heatshrink_decoder_sink(ps->hsd, ps->pend, ps->pend_len, &took);

        if (res < 0) {
            fprintf(stderr, "heatshrink sink 失败(%d)\n", res);
            return got;
        }
        if (took == 0) break;
        memmove(ps->pend, ps->pend + took, ps->pend_len - took);
        ps->pend_len -= took;
    }
    return got;
}

/* 从解压后的命令流读 n 字节(按需拉取补丁文件);0 成功,-1 数据不足/错误 */
static int patch_read_cmd(patch_stream_t *ps, uint8_t *buf, size_t n) {
    size_t done = 0;

    while (done < n) {
        size_t got = 0;
        HSD_poll_res res = heatshrink_decoder_poll(ps->hsd, buf + done, n - done, &got);

        if (res < 0) {
            fprintf(stderr, "heatshrink poll 失败(%d)\n", res);
            return -1;
        }
        done += got;
        if (done >= n) break;

        /* poll 干涸:再从文件拉一轮喂 decoder */
        size_t fed = patch_stream_fetch(ps);

        if (fed == 0 && ps->pend_len == 0) {
            /* 文件与 pending 都尽:再 poll 一次确认 */
            size_t again = 0;
            HSD_poll_res r2 = heatshrink_decoder_poll(ps->hsd, buf + done, n - done, &again);

            if (r2 < 0) return -1;
            done += again;
            if (done < n) {
                fprintf(stderr, "补丁数据不足(命令流提前结束)\n");
                return -1;
            }
        }
        /* fed>0 或 pending 有余量:循环回去继续 poll(sink 已推进输入) */
    }
    return 0;
}

/* detools varint:首字节 bit6=符号位,bit7=续位,低 6 位起,后续字节低 7 位 */
static int patch_read_varint(patch_stream_t *ps, int64_t *out) {
    uint8_t byte;
    uint64_t value;
    int offset = 6;
    int is_signed;

    if (patch_read_cmd(ps, &byte, 1) != 0) return -1;
    is_signed = (byte & 0x40) != 0;
    value = byte & 0x3f;

    while (byte & 0x80) {
        if (patch_read_cmd(ps, &byte, 1) != 0) return -1;
        value |= (uint64_t)(byte & 0x7f) << offset;
        offset += 7;
        if (offset > 62) {
            fprintf(stderr, "varint 过长\n");
            return -1;
        }
    }

    *out = is_signed ? -(int64_t)value : (int64_t)value;
    return 0;
}

/* ============================ bank B flash 写入模拟(页缓存 + 补 0xFF) ============================ */

typedef struct {
    uint8_t *bank;          /* 整个 bank(擦除态 0xFF) */
    size_t bank_size;
    uint8_t *page_buf;      /* 页编程缓存 */
    size_t page_size;
    size_t page_fill;       /* 当前页缓存填充数 */
    size_t page_index;      /* 已编程页数 */
    size_t written;         /* 有效字节数(不含页尾 0xFF 填充) */
    sha256_ctx target_sha;  /* 边写边算:重组固件的 sha256 */
} flash_writer_t;

static int flash_writer_init(flash_writer_t *fw, size_t image_size, size_t page_size) {
    fw->bank_size = ((image_size + page_size - 1) / page_size) * page_size;
    fw->bank = (uint8_t *)malloc(fw->bank_size);
    fw->page_buf = (uint8_t *)malloc(page_size);
    if (!fw->bank || !fw->page_buf) return -1;

    /* 模拟擦除:整区置 0xFF */
    memset(fw->bank, 0xff, fw->bank_size);
    fw->page_size = page_size;
    fw->page_fill = 0;
    fw->page_index = 0;
    fw->written = 0;
    sha256_init(&fw->target_sha);
    return 0;
}

/* 平台相关③:PC demo 只 memcpy;STM32 换成双字编程(HAL_FLASH_Program) */
static void flash_program_page(flash_writer_t *fw) {
    /* 页尾补 0xFF 到编程粒度(擦除态,不影响后续校验) */
    memset(fw->page_buf + fw->page_fill, 0xff, fw->page_size - fw->page_fill);
    memcpy(fw->bank + fw->page_index * fw->page_size, fw->page_buf, fw->page_size);
    fw->page_index++;
    fw->page_fill = 0;
}

static void flash_write(flash_writer_t *fw, const uint8_t *data, size_t len) {
    sha256_update(&fw->target_sha, data, len);
    fw->written += len;

    while (len > 0) {
        size_t take = fw->page_size - fw->page_fill;
        if (take > len) take = len;
        memcpy(fw->page_buf + fw->page_fill, data, take);
        fw->page_fill += take;
        data += take;
        len -= take;
        if (fw->page_fill == fw->page_size) {
            flash_program_page(fw);
        }
    }
}

static void flash_flush(flash_writer_t *fw) {
    if (fw->page_fill > 0) {
        flash_program_page(fw);
    }
}

/* ============================ 应用流程 ============================ */

/* 平台相关②:PC demo 从内存数组读 bank A;STM32 直接读 flash 地址
 * (const uint8_t *)0x08000000 + offset,无需搬运 */
static int flash_read_old(const bin_t *old, size_t offset, uint8_t *buf, size_t len) {
    if (offset + len > old->size) {
        fprintf(stderr, "diff 读取越界:旧镜像 %zu 字节,请求 [%zu, %zu)\n",
                old->size, offset, offset + len);
        return -1;
    }
    memcpy(buf, old->data + offset, len);
    return 0;
}

static void report_progress(size_t done, size_t total) {
    static int last_pct = -1;
    int pct = total ? (int)(done * 100 / total) : 100;

    if (pct != last_pct) {
        printf("\r[installing] 进度 %d%% (%zu/%zu)", pct, done, total);
        fflush(stdout);
        last_pct = pct;
    }
}

int main(int argc, char **argv) {
    const char *v1_path = NULL, *patch_path = NULL, *out_path = NULL, *target_sha_hex = NULL;
    const char *patch_sha_hex = NULL;
    size_t chunk_size = 512;
    size_t page_size = 2048;
    int i;

    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--chunk") == 0 && i + 1 < argc) {
            chunk_size = (size_t)strtoul(argv[++i], NULL, 0);
        } else if (strcmp(argv[i], "--page") == 0 && i + 1 < argc) {
            page_size = (size_t)strtoul(argv[++i], NULL, 0);
        } else if (strcmp(argv[i], "--patch-sha") == 0 && i + 1 < argc) {
            patch_sha_hex = argv[++i];
        } else if (!v1_path) {
            v1_path = argv[i];
        } else if (!patch_path) {
            patch_path = argv[i];
        } else if (!out_path) {
            out_path = argv[i];
        } else if (!target_sha_hex) {
            target_sha_hex = argv[i];
        } else {
            fprintf(stderr, "多余参数: %s\n", argv[i]);
            return 1;
        }
    }

    if (!v1_path || !patch_path || !out_path || !target_sha_hex) {
        fprintf(stderr,
                "用法: %s <v1.bin> <patch.bin> <out.bin> <target_sha256_hex>\n"
                "          [--patch-sha <hex>] [--chunk 512] [--page 2048]\n",
                argv[0]);
        return 1;
    }

    uint8_t expect_target_sha[32];
    if (parse_sha256_hex(target_sha_hex, expect_target_sha) != 0) {
        fprintf(stderr, "target_sha256 必须是 64 位十六进制\n");
        return 1;
    }

    bin_t old_bin;
    if (load_bin(v1_path, &old_bin) != 0) {
        fprintf(stderr, "读取基线固件失败: %s\n", v1_path);
        return 1;
    }

    patch_stream_t ps;
    memset(&ps, 0, sizeof(ps));
    ps.chunk_size = chunk_size ? chunk_size : 512;
    ps.file = fopen(patch_path, "rb");
    if (!ps.file) {
        fprintf(stderr, "无法打开补丁 %s\n", patch_path);
        return 1;
    }
    fseek(ps.file, 0, SEEK_END);
    ps.file_size = ftell(ps.file);
    fseek(ps.file, 0, SEEK_SET);
    sha256_init(&ps.patch_sha);
    if (patch_sha_hex && parse_sha256_hex(patch_sha_hex, ps.expect_patch_sha) == 0) {
        ps.expect_patch_sha_given = 1;
    }

    /* ---- 头部:1 字节格式 + varint 目标大小 + heatshrink 参数字节 ---- */
    uint8_t head_bytes[16];
    size_t head_need = 1;
    if (ps.file_size < 1) {
        fprintf(stderr, "补丁为空\n");
        return 2;
    }
    /* 先读第 1 字节 */
    if (fread(head_bytes, 1, 1, ps.file) != 1) return 2;
    ps.fetched = 1;
    sha256_update(&ps.patch_sha, head_bytes, 1);

    if (head_bytes[0] != PATCH_FORMAT_HEADER) {
        fprintf(stderr,
                "补丁头 0x%02x 不是 sequential+heatshrink(0x04),"
                "可能是其他补丁类型/压缩(本 demo 不支持)\n",
                head_bytes[0]);
        return 2;
    }

    /* varint 目标大小 */
    uint64_t to_size = 0;
    int offset = 6;
    uint8_t byte = 0;
    if (fread(&byte, 1, 1, ps.file) != 1) return 2;
    ps.fetched++;
    sha256_update(&ps.patch_sha, &byte, 1);
    head_bytes[1] = byte;
    to_size = byte & 0x3f;
    while (byte & 0x80) {
        if (fread(&byte, 1, 1, ps.file) != 1) return 2;
        ps.fetched++;
        sha256_update(&ps.patch_sha, &byte, 1);
        head_bytes[++head_need] = byte;
        to_size |= (uint64_t)(byte & 0x7f) << offset;
        offset += 7;
    }

    /* heatshrink 参数字节:((window_sz2-4)<<4)|(lookahead_sz2-3) */
    uint8_t hs_params;
    if (fread(&hs_params, 1, 1, ps.file) != 1) return 2;
    ps.fetched++;
    sha256_update(&ps.patch_sha, &hs_params, 1);
    int window_sz2 = (hs_params >> 4) + 4;
    int lookahead_sz2 = (hs_params & 0xf) + 3;

    printf("[download ] 补丁 %ld 字节,目标固件 %llu 字节,heatshrink window 2^%d lookahead 2^%d\n",
           ps.file_size, (unsigned long long)to_size, window_sz2, lookahead_sz2);

    ps.hsd = heatshrink_decoder_alloc(256, (uint8_t)window_sz2, (uint8_t)lookahead_sz2);
    if (!ps.hsd) {
        fprintf(stderr, "heatshrink 参数非法(window=%d lookahead=%d)\n",
                window_sz2, lookahead_sz2);
        return 2;
    }

    /* 命令流首个 varint:data_format 长度(平台固定 0,非 0 说明不是平台生成的补丁) */
    int64_t df_size = 0;
    if (patch_read_varint(&ps, &df_size) != 0 || df_size != 0) {
        fprintf(stderr, "命令流首字段非 0(不支持 data_format 编码补丁)\n");
        return 2;
    }

    /* ---- 擦除 bank B,准备写入 ---- */
    flash_writer_t fw;
    if (flash_writer_init(&fw, (size_t)to_size, page_size) != 0) {
        fprintf(stderr, "bank B 分配失败\n");
        return 1;
    }

    size_t to_pos = 0;
    size_t from_pos = 0;
    uint8_t cmd[256];
    uint8_t old_chunk[256];

    while (to_pos < to_size) {
        /* diff 段:n 字节 = 补丁字节 + 旧镜像字节(mod 256) */
        int64_t diff_size;
        if (patch_read_varint(&ps, &diff_size) != 0) return 2;
        if (diff_size < 0 || (size_t)diff_size > to_size - to_pos) {
            fprintf(stderr, "diff 段长度非法(%lld)\n", (long long)diff_size);
            return 2;
        }
        while (diff_size > 0) {
            size_t take = (size_t)diff_size > sizeof(cmd) ? sizeof(cmd) : (size_t)diff_size;
            if (patch_read_cmd(&ps, cmd, take) != 0) return 2;
            if (flash_read_old(&old_bin, from_pos, old_chunk, take) != 0) return 2;
            for (size_t j = 0; j < take; j++) cmd[j] += old_chunk[j];
            flash_write(&fw, cmd, take);
            from_pos += take;
            to_pos += take;
            diff_size -= (int64_t)take;
            report_progress(to_pos, (size_t)to_size);
        }

        /* extra 段:n 字节字面输出 */
        int64_t extra_size;
        if (patch_read_varint(&ps, &extra_size) != 0) return 2;
        if (extra_size < 0 || (size_t)extra_size > to_size - to_pos) {
            fprintf(stderr, "extra 段长度非法(%lld)\n", (long long)extra_size);
            return 2;
        }
        while (extra_size > 0) {
            size_t take = (size_t)extra_size > sizeof(cmd) ? sizeof(cmd) : (size_t)extra_size;
            if (patch_read_cmd(&ps, cmd, take) != 0) return 2;
            flash_write(&fw, cmd, take);
            to_pos += take;
            extra_size -= (int64_t)take;
            report_progress(to_pos, (size_t)to_size);
        }

        /* 调整段:旧镜像游标有符号偏移 */
        int64_t adjust;
        if (patch_read_varint(&ps, &adjust) != 0) return 2;
        if ((int64_t)from_pos + adjust < 0) {
            fprintf(stderr, "调整段导致旧镜像游标为负\n");
            return 2;
        }
        from_pos = (size_t)((int64_t)from_pos + adjust);
    }

    flash_flush(&fw);
    printf("\n");

    /* ---- 校验:补丁 sha256(已下载完) 与 重组结果 sha256 ---- */
    uint8_t digest[32];
    char hex[65];

    sha256_final(&ps.patch_sha, digest);
    sha256_hex(digest, hex);
    printf("[verify   ] 补丁 sha256 = %s\n", hex);
    if (ps.expect_patch_sha_given &&
        memcmp(digest, ps.expect_patch_sha, 32) != 0) {
        fprintf(stderr, "补丁 sha256 不匹配(notify payload 的 sha256 字段)\n");
        return 3;
    }

    if (fw.written != (size_t)to_size) {
        fprintf(stderr, "重组长度 %zu != 目标 %llu\n", fw.written, (unsigned long long)to_size);
        return 4;
    }

    sha256_final(&fw.target_sha, digest);
    sha256_hex(digest, hex);
    printf("[verify   ] 目标 sha256 = %s (期望 %s)\n", hex, target_sha_hex);
    if (memcmp(digest, expect_target_sha, 32) != 0) {
        fprintf(stderr,
                "目标 sha256 不匹配——基线固件不是补丁对应的 V1?"
                "(设备端此时应丢弃 bank B 并上报失败,保持 bank A 不动)\n");
        return 4;
    }

    FILE *out = fopen(out_path, "wb");
    if (!out || fwrite(fw.bank, 1, fw.written, out) != fw.written) {
        fprintf(stderr, "写出 %s 失败\n", out_path);
        return 1;
    }
    fclose(out);

    printf("[done     ] 重组成功,%zu 字节(页 %zu×%zu,补 0xFF 至 %zu 字节),已写出 %s\n",
           fw.written, fw.page_index, fw.page_size, fw.bank_size, out_path);

    heatshrink_decoder_free(ps.hsd);
    fclose(ps.file);
    free(fw.bank);
    free(fw.page_buf);
    free(old_bin.data);
    return 0;
}

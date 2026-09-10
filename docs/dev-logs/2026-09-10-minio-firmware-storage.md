# 2026-09-10 固件存储迁移 MinIO 开发日志

## 背景

生产 Docker 部署后固件下载链接 404（`https://www.ziot.asia/uploads/firmwares/...`）。根因：multipart 上传路由把固件写进容器内 `public/uploads/firmwares/`——运行时写入 `public/` 的文件生产环境不保证被 Next.js 服务，且 web 服务没有持久卷，容器重建即丢（`.gitignore` 也排除该目录，镜像构建不带）。DB 记录还在、`file_url` 指向已消失的文件，比单纯丢文件更隐蔽。

生产编排其实早已备好对象存储：MinIO（named volume）、nginx `/ziot-firmwares/` 反代（保留 Host 的 SigV4 兼容代理）、`MINIO_*` 环境变量、`createFirmwareUploadUrl` 预签名 PUT——只差上传/下载主链路接上。

## 方案决策

1. **服务端代理上传**：multipart 路由继续接收字节（sha256 保持服务端计算，UI 契约零改动），`putObject` 到 MinIO。不做浏览器预签名直传改造。
2. **DB `file_url` 存规范 URI** `minio://<bucket>/<objectKey>`；遗留 `https://.../uploads/...` 行原样保留（文件已丢，UI 删除坏记录），不回填。
3. **桶保持私有**，下载用 `presignedGetObject`：固件 list/get/上传响应附 `download_url`（约 1h）；OTA notify 的 `file_url` 为预签名直链（约 24h，设备应及时下载）。
4. **对象 key**：`firmwares/<product_key>/<uuid>-<文件名>`；差分 `.../<uuid>-delta-<V1>-<V2>.patch`（uuid 前缀防碰撞）。
5. **双端点**：服务端读写走 `MINIO_INTERNAL_*`（compose 内 `minio:9000`，缺省回落公共端点），预签名用公共端点（生产 `www.ziot.asia:443` + nginx 反代）——规避容器经公网 IP 回环（hairpin NAT）不确定性，也免得每次上传走一层 nginx/TLS。
6. **MinIO 不可用快速失败**，不静默回落本地盘（那正是本次修的 bug）；首次使用惰性 `ensureFirmwareBucket`（bucketExists→makeBucket，promise 缓存），顺带兜底 dev compose 没有 minio-init 的坑。

## 踩坑

- **minio-js 预签名并非纯离线**：client 未配置 `region` 时，`presignedGetObject`/`putObject` 每次都会先发 `GET /<bucket>?location` 查 bucket region（网络请求）。生产里这等于每次签名都打公共端点（走 nginx 回环），本地单测也因 ECONNREFUSED 暴露。解法：client 工厂显式 `region`（默认 `us-east-1`，可用 `MINIO_REGION` 覆盖），签名变纯离线 HMAC。测试 `firmware-storage.test.ts` 直接断言了离线签名产出的 URL 形态。
- **presigned URL 与 nginx 反代路径**：path-style 访问下桶名就在 URL 路径首位（`/ziot-firmwares/<key>`），nginx `location /ziot-firmwares/` + `proxy_set_header Host $host` 原样转发即兼容 SigV4（签名含 Host）。预签名 PUT 此前已验证可用，GET 同机制。
- **dev compose 预签名主机不可达（存量隐患）**：原 dev compose `MINIO_ENDPOINT=minio`，容器外浏览器拿到的预签名 URL 主机是 `minio:9000`（不可解析）。改为公共端点 `localhost:9000`（compose 已发布端口）+ 内网 `minio:9000` 双端点后顺带修复。

## 新增/改动代码

| 文件 | 改动 |
| --- | --- |
| `apps/web/features/ota/firmware-storage.ts` | 新增。MinIO 唯一入口：ops/sign 双 client、ensureBucket、put/remove、key 构造（吸收路由里的 safePathSegment）、`minio://` URI 工具、预签名 GET/PUT、过期常量 |
| `apps/web/features/ota/ota-service.ts` | `decorateFirmware` 附 `download_url`（list/get/create/createDelta 返回值）；`otaNotifyPayload` 改 async 预签名（`startOtaTask` 循环外算一次）；`deleteFirmware` 按 scheme 分派清理；`createFirmwareUploadUrl` 用共享模块并删除未配置 fallback；export `findProductForScope` |
| `apps/web/app/api/v1/firmwares/upload/route.ts` | 删本地盘写入，`putFirmwareObject` + `minioStorageUrl`；失败回滚删对象 |
| `apps/web/app/api/v1/firmwares/delta/route.ts` | 补丁字节 `putFirmwareObject`；V1/V2 临时目录处理不变 |
| `apps/web/components/ota/ota-console-panel.tsx` | `Firmware` 类型 + 链接用 `download_url ?? file_url` |
| `packages/config/src/env.ts` | 补可选 `MINIO_PORT/BUCKET/USE_SSL/INTERNAL_*/REGION` |
| `deploy/docker-compose.prod.yml` | `&app-env` 加 `MINIO_INTERNAL_*` 三件套 |
| `deploy/docker-compose.yml` | 公共端点改 `localhost:9000` + 内网 `minio:9000` |
| `apps/web/e2e/minio-available.ts` | 新增。本地 MinIO 健康检查，两个固件 spec 据此 skip（同 detools 守卫先例） |

## 测试

- 单测：`firmware-storage.test.ts`（key 构造/清洗、URI 往返、http(s) 透传、离线签名 URL 形态）；`ota-service.test.ts` `vi.mock("./firmware-storage")` 后新增 minio:// 固件的 `download_url`、deleteFirmware 调 `removeFirmwareObject`、notify payload 携带预签名 URL / 遗留 URL 原样下发。
- E2E：`firmware-delete.spec.ts` 增强为真链路断言——上传后 fetch 行内预签名 href，200 且字节与上传一致；删除后同链接 404（对象已被清理）。MinIO 未启动时 spec skip 而非红。

## 部署注意

- 生产需重建镜像并 `up -d`（新增 `MINIO_INTERNAL_*` env）；桶由 minio-init 或惰性建桶自动就绪。
- 遗留 `https://.../uploads/...` 固件记录的 notify 仍发死链，需在控制台删除重建。
- 本地原生开发：`.runtime/bin/minio server .runtime/minio-data --address :9000`（`.env.local` 已指向 localhost:9000），e2e 依赖它。

## 更新（同日）：预签名直链改为永久公共直链

用户拍板：下载链接**不需要签名、不需要过期时间**。调整：

1. **桶设为匿名只读**（`s3:GetObject`）：`ensureFirmwareBucket` 里 `setBucketPolicy` 幂等下发（存量桶也生效，覆盖 dev 无 minio-init 的场景），minio-init 增加 `mc anonymous set download` 双保险。写入仍需 access key；对象 key 带 UUID 前缀不可枚举——接受"知道链接即可下载"的权衡。
2. `presignedFirmwareGetUrl` + 两个过期常量删除，替换为**同步**的 `firmwarePublicUrl`：按公共端点拼 path-style 永久直链（非默认端口显式带端口，443/80 省略），`otaNotifyPayload` 随之改回同步。
3. `download_url` 字段保留但语义变为永久直链（UI 无需改动）；DB 仍存 `minio://` 规范 URI——换域名时链接随环境变量自动更新，不迁移数据。
4. `presignedPutObjectUrl`（upload-url 浏览器直传）保留——写入不能匿名。
5. e2e 断言同步调整（直链不再带 `X-Amz-` 参数）。

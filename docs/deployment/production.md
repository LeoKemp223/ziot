# 生产部署实录（www.ziot.asia 单机 Docker）

本文记录 2026-09-03 在腾讯云轻量服务器上的真实部署过程，可照抄复现。

## 环境与结果

| 项 | 值 |
| --- | --- |
| 服务器 | 腾讯云轻量 2C / 4G / 70G，Ubuntu 24.04，Docker 29.x + Compose v5 |
| 公网 | 43.132.209.107（www.ziot.asia / ziot.asia，DNS 已解析） |
| 对外端口 | 80/443（HTTPS 控制台与 API）、1883（MQTT）、8883（MQTT over TLS，Let's Encrypt 证书） |
| 内部组件 | PostgreSQL 16、Redis 7（noeviction）、MinIO、EMQX 5.10、web、worker、nginx——全部容器化，仅 compose 内网互通 |
| 健康状态 | 7 个容器全部 healthy，`pnpm smoke` 9 步全过（对公网入口） |

默认账号：`13800000001` / `Admin123456`（管理员）、`13800000002` / `Operator123456`（运营）。
**上线前务必改掉**（文档底部"安全清单"）。

## 文件清单（deploy/）

| 文件 | 用途 |
| --- | --- |
| `Dockerfile.prod` | 生产镜像：多阶段构建，web/worker/迁移共用一个镜像 |
| `docker-compose.prod.yml` | 生产编排（服务、健康检查、资源限额、restart: unless-stopped） |
| `prod/nginx.conf` | HTTPS 反代：`/` → web，`/ziot-firmwares/` → MinIO（presigned 直传） |
| `prod/emqx.conf` | EMQX 完整配置：HTTP 认证/ACL + 1883 + 8883 SSL（整文件替换 emqx.conf） |
| `prod/redis.conf` | `maxmemory-policy noeviction`（BullMQ 必需，lightweight 版是 allkeys-lru 会丢任务） |
| `prod.env` | 全部生产凭证（随机生成，已 gitignore） |
| `certs/` | Let's Encrypt 证书副本（sync-certs.sh 生成，已 gitignore） |
| `sync-certs.sh` | 从 /etc/letsencrypt 同步证书并设权限（uid 1000 = 容器内 emqx 用户） |
| `certbot-www/` | ACME webroot（续期用，nginx 挂载） |

国内源已内置：Docker 走 `mirror.ccs.tencentyun.com`（宿主 /etc/docker/daemon.json），
镜像构建内 apk 走腾讯镜像、corepack/pnpm/npm 依赖走 `registry.npmmirror.com`（见 Dockerfile.prod 头部）。

## 首次部署步骤

### 0. 前置

- DNS A 记录指向服务器公网 IP；安全组放行 80/443/1883/8883（22 按需）。
- `sudo usermod -aG docker ubuntu` 后重登录（免 sudo 跑 docker）。

### 1. 证书（先于 nginx 占用 80）

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone --non-interactive --agree-tos \
  --register-unsafely-without-email -d www.ziot.asia -d ziot.asia
./deploy/sync-certs.sh www.ziot.asia
```

续期走 webroot（nginx 已配 `/.well-known/acme-challenge/`）。把 `/etc/letsencrypt/renewal/www.ziot.asia.conf`
中 `authenticator = standalone` 改为 `webroot`，并追加：

```ini
webroot_path = <repo>/deploy/certbot-www,
[[webroot_map]]
www.ziot.asia = <repo>/deploy/certbot-www
ziot.asia = <repo>/deploy/certbot-www
```

然后验证：

```bash
sudo certbot renew --dry-run   # 应输出 all simulated renewals succeeded
```

续期成功后自动重载容器（deploy hook 已装在
`/etc/letsencrypt/renewal-hooks/deploy/ziot-docker.sh`：sync-certs + restart nginx emqx）。

### 2. 凭据

```bash
cat > deploy/prod.env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
MINIO_ACCESS_KEY=ziot
MINIO_SECRET_KEY=$(openssl rand -hex 16)
MINIO_BUCKET=ziot-firmwares
EMQX_DASHBOARD_USERNAME=admin
EMQX_DASHBOARD_PASSWORD=$(openssl rand -hex 12)
PUBLIC_DOMAIN=www.ziot.asia
PUBLIC_APP_URL=https://www.ziot.asia
EOF
chmod 600 deploy/prod.env
```

### 3. 构建与启动

```bash
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml build
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml up -d
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml ps   # 等 7 个 healthy
```

MinIO 桶由 `minio-init` 一次性服务自动创建（应用侧 `ensureFirmwareBucket` 也会在首次使用时兜底建桶）。

固件对象存储：控制台上传的整包/差分固件存 MinIO 桶（对象 key `firmwares/<product_key>/<uuid>-<文件名>`），DB `firmware.file_url` 存 `minio://` 规范 URI。服务端 putObject/removeObject 走内网端点（`MINIO_INTERNAL_*`，compose 内 `minio:9000`），避免容器经公网 IP 回环；下载走公共端点**永久直链**（桶为匿名只读，无签名无过期），经 nginx `/ziot-firmwares/` 反代。桶策略由 minio-init（`mc anonymous set download`）与代码内 `ensureFirmwareBucket` 双重幂等保证——**只有 GetObject 匿名可读，对象 key 带 UUID 前缀不可枚举，写入仍需 access key**（按产品决策接受"知道链接即可下载"的权衡）。
> 踩坑：早期版本固件写在容器内 `public/uploads/firmwares/`，运行时写入的 `public/` 文件生产环境不保证被 Next.js 服务、容器重建即丢，导致下载 404——这是迁移到对象存储的根因。

差分固件：镜像构建时已在 `/opt/detools` venv 装好 `detools`（bsdiff+heatshrink 补丁生成工具），并内置 `DETOOLS_BIN=/opt/detools/bin/detools`，无需额外配置。可验证：

```bash
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml \
  run --rm --no-deps web /opt/detools/bin/detools --help
```

### 4. 数据库初始化

```bash
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml \
  run --rm --no-deps web pnpm --filter @ziot/db exec prisma db push --schema prisma/schema.prisma
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml \
  run --rm --no-deps web pnpm --filter @ziot/db seed
```

### 5. EMQX webhook 规则（上下线/命令回执/设备上报/OTA 进度）

```bash
source <(grep -E '^(EMQX_DASHBOARD_USERNAME|EMQX_DASHBOARD_PASSWORD)=' deploy/prod.env | sed 's/^/export /')
EMQX_API_URL=http://localhost:18083 ZIOT_WEBHOOK_BASE_URL=http://web:3000 \
  bash scripts/setup-emqx-webhook.sh
```

（脚本可重复执行；规则存在 `emqx-data` 卷，emqx 容器重建不丢。`scripts/prod-deploy.sh`
检测到 emqx 重建时会自动重跑一遍做双保险。）

### 6. 验证

```bash
curl https://www.ziot.asia/api/v1/health
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml \
  run --rm --no-deps -e BASE_URL=https://www.ziot.asia -e MQTT_BROKER_URL=mqtt://www.ziot.asia:1883 \
  -e ADMIN_ACCOUNT=<管理员账号> -e ADMIN_PASSWORD=<管理员密码> \
  web pnpm --filter @ziot/device-simulator exec tsx ../../scripts/run-smoke-tests.ts
# 脚本默认用 seed 账号 13800000001/Admin123456；线上账号已改，必须显式传 ADMIN_ACCOUNT/ADMIN_PASSWORD
openssl s_client -connect www.ziot.asia:8883 -servername www.ziot.asia </dev/null 2>/dev/null | grep subject=
```

## 日常运维

```bash
# 更新发布（构建 → 结构同步[有差异才推] → up -d → 重启 nginx → 健康验证，一步到位）
git pull && scripts/prod-deploy.sh
# 按模块更新：app = web+worker（共享镜像）｜web｜worker｜db（只同步结构）｜infra（nginx/emqx 配置变更后重建）
# 其它 compose 服务名（postgres/redis/minio/emqx/nginx）也可作参数，force-recreate 应用配置变更
scripts/prod-deploy.sh app

# 日志 / 状态
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml logs -f web worker
docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml ps

# 清理构建缓存与悬空镜像（保留最近 2GB 缓存，deps 层命中时重建约 30s；--full 全清）
scripts/docker-cleanup.sh

# 数据库备份（custom 格式，见 docs/deployment/backup-restore.md）
docker exec ziot-postgres-1 pg_dump -U ziot -Fc ziot > backups/ziot-$(date +%Y%m%dT%H%M%SZ).dump

# EMQX Dashboard（仅本机）
ssh -L 18083:127.0.0.1:18083 ubuntu@43.132.209.107 后访问 http://localhost:18083
```

服务器重启后：`restart: unless-stopped` 会自动拉起全部容器，无需手动干预。

## 实测踩坑（都有通用性）

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| EMQX 5.10 不加载 `etc/conf.d/` | conf.d 里的认证/SSL 配置全部无效，8883 服务自签证书、设备认证列表为空 | 配置整文件写进 `emqx.conf` 并挂载替换（`deploy/prod/emqx.conf`），优先级 emqx.conf > base.hocon。dev compose（`deploy/docker-compose.yml`）仍挂 conf.d，在新镜像下同样不生效 |
| postgres 挂载路径写错 | Docker 把不存在的路径建成目录，postgres 报 "input in flex scanner failed" | 挂载源必须是真实文件（本仓库是 `lightweight/postgres.conf` 不是 `postgresql.conf`） |
| 首启崩溃导致建库不完整 | initdb 建了用户但 `ziot` 库没建、pg_hba 缺 host 条目，Prisma P1010 | `docker exec ziot-postgres-1 createdb -U ziot ziot`；pg_hba 追加 `host all all all scram-sha-256` 后 `select pg_reload_conf()` |
| 容器内 localhost 是 ::1 | healthcheck 用 localhost 全部误报 unhealthy | 探活地址一律用 `127.0.0.1` |
| `emqx ctl status` 在 exec(root) 下 | erlang cookie 不匹配 → "not responding to pings" 误报 | healthcheck 改探 `curl -sf http://127.0.0.1:18083/status` |
| 单文件 bind mount + 编辑器改文件 | inode 变了，容器里还是旧内容（nginx 一直报旧错误） | 改配置后 `up -d --force-recreate <svc>` |
| typedRoutes 生产构建失败 | `next dev` 不做类型检查，`next build` 时 `Type 'string' is not assignable to 'RouteImpl'` | `NavItem.href` 用 `import type { Route } from "next"`（已修，`components/console/dashboard-data.ts`） |
| presigned URL 直传 MinIO | 内网 endpoint 浏览器不可达 | `MINIO_ENDPOINT=www.ziot.asia:443(useSSL)`，nginx 反代 `/ziot-firmwares/` 且**保留原始 Host**（SigV4 签名含 Host） |
| Prisma 7 移除 `--from-schema-datasource` | `migrate diff` 直接报错，exit 1 若被当成"有差异"会空跑 db push | 用 `--from-config-datasource --to-schema <file> --exit-code`，并区分 rc：0=一致、2=有差异、1=命令出错（`scripts/prod-deploy.sh` 已按此实现） |

## 安全清单

- [ ] 改掉两个默认账号密码（登录后立即改）。
- [ ] `deploy/prod.env` 已随机生成（本次部署即是），泄漏时轮换 JWT_SECRET 需重新登录所有会话。
- [ ] EMQX Dashboard（18083）/ MinIO Console（9001）/ Postgres / Redis 只在 compose 内网，未暴露公网。
- [ ] 证书自动续期已验证（`certbot renew --dry-run`），续期后自动 reload nginx/emqx。

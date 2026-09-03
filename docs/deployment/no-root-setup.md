# 免 root 部署指南(全新 Ubuntu 服务器)

适用场景:目标服务器**没有 Docker、没有 sudo 权限**,只有普通用户 SSH。
实测环境:Ubuntu 22.04 jammy(x86_64),2026-09 验证,`pnpm smoke` 10 步全过。

核心思路:所有组件以 deb 解压 / 官方二进制的方式装进项目目录 `.runtime/`(已 gitignore),
不动系统、不需要任何特权,换机器时 clone 项目照抄本文即可。

## 0. 约定与端口

```bash
# 全文以项目根为基准,先设一个变量方便复制
ZIOT_ROOT="$HOME/work/ziot"      # 按实际路径改
RT="$ZIOT_ROOT/.runtime"          # 所有用户态组件的家
mkdir -p "$RT"/{bin,debs,opt,emqx/data,emqx/log,redis/data,minio-data,postgres}
```

| 组件 | 端口 | 凭证 | 数据位置 |
| --- | --- | --- | --- |
| Web 控制台 | 3000 | `13800000001` / `Admin123456` | — |
| PostgreSQL 14 | 127.0.0.1:55432 | 用户 `ziot`(trust 免密) | `$RT/postgres` |
| Redis 6 | 127.0.0.1:6379 | 无 | `$RT/redis/data` |
| EMQX 5.8.9 | 1883(MQTT)/ 18083(Dashboard) | Dashboard `admin` / `public123` | `$RT/emqx` |
| MinIO | 9000(API)/ 9001(控制台) | `ziot` / `ziot-secret`,桶 `ziot-firmwares` | `$RT/minio-data` |

数据库连接串:`postgresql://ziot:ziot@localhost:55432/ziot`

## 1. Node 20 + pnpm

Next.js 16 要求 Node ≥ 20.9,系统自带 18 不行:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh && nvm install 20
corepack enable   # 根目录 package.json 已声明 pnpm@10.8.1,corepack 自动匹配
```

注意:每次新 shell 都要先 `source ~/.nvm/nvm.sh && nvm use 20`(或写进 `~/.bashrc`)。

## 2. PostgreSQL 14(apt 下载 deb 后解压)

```bash
cd "$RT/debs"
apt-get download postgresql-14 postgresql-client-14 libpq5   # 无需 root
mkdir -p "$RT/opt" && for d in *.deb; do dpkg -x "$d" "$RT/opt"; done
```

初始化项目内实例(trust 认证,免密,仅监听本机):

```bash
export PGBIN="$RT/opt/usr/lib/postgresql/14/bin"
export LD_LIBRARY_PATH="$RT/opt/usr/lib/x86_64-linux-gnu"
$PGBIN/initdb -D "$RT/postgres" -U ziot --auth=trust --encoding=UTF8 --locale=C.UTF-8
$PGBIN/pg_ctl -D "$RT/postgres" -l "$RT/postgres.log" \
  -o "-p 55432 -k /tmp -c listen_addresses=localhost" start
$PGBIN/createdb -h localhost -p 55432 -U ziot ziot
```

## 3. Redis 6(deb 解压,注意依赖包多)

```bash
cd "$RT/debs"
apt-get download redis-server redis-tools libjemalloc2 liblzf1 \
  liblua5.1-0 lua-cjson lua-bitop
for d in redis-server_*.deb redis-tools_*.deb libjemalloc2_*.deb liblzf1_*.deb \
  liblua5.1-0*.deb lua-cjson*.deb lua-bitop*.deb; do dpkg -x "$d" "$RT/opt"; done

cat > "$RT/redis/redis.conf" <<EOF
port 6379
bind 127.0.0.1
dir $RT/redis/data
daemonize yes
pidfile $RT/redis/redis.pid
logfile $RT/redis/redis.log
maxmemory 256mb
maxmemory-policy noeviction
EOF

export LD_LIBRARY_PATH="$RT/opt/usr/lib/x86_64-linux-gnu"
"$RT/opt/usr/bin/redis-server" "$RT/redis/redis.conf" && redis-cli ping 2>/dev/null || \
  "$RT/opt/usr/bin/redis-cli" ping
```

> ⚠️ `maxmemory-policy` 必须是 `noeviction`(BullMQ 要求,`allkeys-lru` 会丢任务并刷警告)。

## 4. MinIO(官方单二进制)

```bash
cd "$RT/bin"
wget -q https://dl.min.io/server/minio/release/linux-amd64/minio -O minio
wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O mc && chmod +x minio mc

cd "$RT"
MINIO_ROOT_USER=ziot MINIO_ROOT_PASSWORD=ziot-secret nohup ./bin/minio server \
  ./minio-data --address :9000 --console-address :9001 > minio.log 2>&1 &
sleep 2 && ./bin/mc alias set local http://localhost:9000 ziot ziot-secret
./bin/mc mb --ignore-existing local/ziot-firmwares
```

## 5. EMQX 5.8.9(packagecloud 的 deb 解压)

### 5.1 下载

官网下载页是 JS 渲染、`files.emqx.com` 可能不可达,直接用 packagecloud apt 仓库:

```bash
cd "$RT/debs"
curl -sL -H 'user-agent: Mozilla/5.0' -o emqx_5.8.9_amd64.deb \
  "https://packagecloud.io/emqx/emqx/ubuntu/pool/jammy/main/e/emqx/emqx_5.8.9_amd64.deb"
dpkg -x emqx_5.8.9_amd64.deb "$RT/opt"
```

> jammy 仓库最高 5.8.9(docker-compose 里用的 5.10)。HTTP 认证/ACL、规则引擎 webhook
> 在 5.x 全系一致,本地/私有部署够用。ldd 检查 beam.smp 无缺库。

### 5.2 改四处 deb 的硬编码路径(关键坑)

编辑 `$RT/opt/usr/lib/emqx/releases/emqx_vars`:

```bash
EMQX_HOME="$RT/opt/usr/lib/emqx"
sed -i "s|^RUNNER_USER=\"emqx\"|RUNNER_USER=\"$USER\"|"          "$EMQX_HOME/releases/emqx_vars"
sed -i "s|^EMQX_ETC_DIR=\"/etc/emqx\"|EMQX_ETC_DIR=\"$RT/opt/etc/emqx\"|" "$EMQX_HOME/releases/emqx_vars"
sed -i "s|^RUNNER_BIN_DIR=\"/usr/bin\"|RUNNER_BIN_DIR=\"$RT/opt/usr/bin\"|" "$EMQX_HOME/releases/emqx_vars"
ln -sf ../lib/emqx/bin/emqx "$RT/opt/usr/bin/emqx"   # run_erl 要 exec 这个路径
```

- `RUNNER_USER`:deb 默认 `emqx`,不改会报 "You need to be root or use sudo"
- `EMQX_ETC_DIR`:deb 默认 `/etc/emqx`
- `RUNNER_BIN_DIR` + 符号链接:否则启动报 `exec: .../bin/emqx: not found`

### 5.3 配置(追加到 `$RT/opt/etc/emqx/emqx.conf`)

```bash
# ① 设备认证/ACL 回调(dev.conf 里 web:3000 是 compose 服务名,要换成本机)
sed 's|http://web:3000|http://localhost:3000|g' "$ZIOT_ROOT/deploy/emqx/dev.conf"
# ② 端口/仪表盘(deploy/lightweight/emqx.conf 里 log 路径要换)
cat "$ZIOT_ROOT/deploy/lightweight/emqx.conf" | sed "s|/opt/emqx/log/emqx.log|$RT/emqx/log/emqx.log|"
# ③ 数据目录(默认 /var/lib/emqx)
echo "node.data_dir = \"$RT/emqx/data\""
```

把三段依次 `>>` 追加进 emqx.conf,然后**必须**:

```bash
sed -i 's|^dashboard.listeners.http.bind = 0.0.0.0:18083|dashboard.listeners.http.bind = "0.0.0.0:18083"|; s|^listeners.tcp.default.bind = 0.0.0.0:1883|listeners.tcp.default.bind = "0.0.0.0:1883"|' "$RT/opt/etc/emqx/emqx.conf"
```

> ⚠️ HOCON 语法:裸配置里 `bind = 0.0.0.0:18083` 会 parse error,必须加引号
> (docker 镜像入口处理过,裸装没有这层)。

### 5.4 启动 + 配 webhook 规则

```bash
export EMQX_LOG_DIR="$RT/emqx/log" HOME="$HOME"
cd "$RT/opt/usr/lib/emqx" && bin/emqx start
sleep 10 && bin/emqx ctl status    # 应输出 5.8.9 is started

# 配置 4 类 webhook(上下线/命令回执/设备上报/OTA 进度),需 curl + jq
cd "$ZIOT_ROOT" && ZIOT_WEBHOOK_BASE_URL=http://localhost:3000 bash scripts/setup-emqx-webhook.sh
```

## 6. 项目初始化与启动

```bash
cd "$ZIOT_ROOT"
source ~/.nvm/nvm.sh && nvm use 20
pnpm install        # package.json 已配 pnpm.onlyBuiltDependencies,构建脚本免审批

# 建表 + 种子数据
export DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot
pnpm --filter @ziot/db exec prisma db push --schema prisma/schema.prisma
pnpm --filter @ziot/db seed

# web 的环境变量(Next.js 自动加载 .env.local)
cat > apps/web/.env.local <<EOF
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot
REDIS_URL=redis://localhost:6379
JWT_SECRET=local-development-secret-change-before-production
PUBLIC_APP_URL=http://localhost:3000
EMQX_API_URL=http://localhost:18083
EMQX_DASHBOARD_USERNAME=admin
EMQX_DASHBOARD_PASSWORD=public123
MQTT_HOST=localhost
MQTT_PORT=1883
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_BUCKET=ziot-firmwares
MINIO_ACCESS_KEY=ziot
MINIO_SECRET_KEY=ziot-secret
EOF

# 启动 web(后台)
pnpm --filter @ziot/web dev > "$RT/web.log" 2>&1 &

# 启动 worker(⚠️ tsx 不读 .env 文件,必须显式传)
DATABASE_URL=$DATABASE_URL REDIS_URL=redis://localhost:6379 \
  JWT_SECRET=local-development-secret-change-before-production \
  pnpm --filter @ziot/worker dev > "$RT/worker.log" 2>&1 &
```

## 7. 验证

```bash
curl -s http://localhost:3000/api/v1/health        # {"status":"ok"...}
pnpm smoke    # 13 步:健康/登录/邀请注册/产品/设备/MQTT连接/属性上报/控制/
              # App注册登录/扫码绑定+列表/同步控制+影子/永久码共享+轮换+解绑/OTA(notify+result)
```

## 8. 服务器重启后的拉起顺序

PG → Redis → MinIO → EMQX → web → worker(命令见上文各节;EMQX 的 webhook 规则
存在 `$RT/emqx/data`,重启不需要重跑 setup 脚本)。

## 9. 踩坑清单(都是实际踩过的)

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| deb 缺依赖库 | redis/psql `not found` | `apt-get download libpq5 libjemalloc2 liblzf1 liblua5.1-0 lua-cjson lua-bitop` 解压后 `LD_LIBRARY_PATH` |
| EMQX root 检查 | "You need to be root or use sudo" | `emqx_vars` 改 `RUNNER_USER` 为当前用户 |
| EMQX 找不到配置 | "emqx.conf is not found in /etc/emqx" | `emqx_vars` 改 `EMQX_ETC_DIR` |
| EMQX 启动卡死 | exec bin/emqx not found | `RUNNER_BIN_DIR` + 符号链接 |
| HOCON parse error | syntax error before: 0.0 | bind 值加引号 |
| EMQX 建目录失败 | mkdir /var/lib/emqx 权限不够 | `node.data_dir` 指到用户目录 |
| BullMQ 警告+丢任务 | eviction policy is allkeys-lru | redis.conf 改 `noeviction` |
| pnpm 装完 prisma 不能用 | Ignored build scripts 警告 | package.json 配 `onlyBuiltDependencies` |
| 登录 401 | 账号或密码错误 | 字段是 `account`,不是 `email` |
| 局域网访问页面点按钮无反应/URL 带表单参数 | Next 16 dev 拦截非 localhost 来源的 HMR,页面不水合 | `next.config.ts` 加 `allowedDevOrigins: ["<内网IP>"]` 并重启 dev server |
| web 冷启动首个设备请求 500 | Stream isn't writeable | 已修(lazyConnect 客户端主动建连+内存降级);若部署旧代码需回移该补丁 |
| `prisma migrate dev` 要 reset 清库 | 本地库无 `_prisma_migrations` 表(历来 db push) | **只用 `db push`**;要补迁移文件用 `migrate diff --from-schema 旧版 --to-schema 新版 --script` |
| schema 变更后命令下发一律 500 | 运行中的 next dev 持旧 Prisma client,不认识新列 | `prisma:generate` 后**重启 next dev**(不会热加载) |
| API 间歇性 404(路由明明存在) | **两个 next dev 实例同时在跑**(重复启动),各持新旧路由清单 | `pgrep -af next` 确认只留一个;`kill -9` 全部 + `rm -rf apps/web/.next` 后重启单实例 |
| 2 个单测失败 | auth-service 时间相关 | 存量问题,与部署无关 |

## 10. 与正式部署(docker-compose)的关系

本方案是**无 root 环境**的替代路径,组件版本略有差异(EMQX 5.8.9 vs 5.10、Redis 6.0);
有 Docker 的服务器仍优先用 `deploy/docker-compose.yml`(见 `private-deployment.md`),
生产暴露前务必换掉全部默认密码和 `JWT_SECRET`。

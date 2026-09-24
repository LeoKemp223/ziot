# ZiOT — 中小型 IoT 设备云平台

面向中小型物联网项目的一站式设备云平台:设备接入、管理、控制、OTA 升级与运维后台。支持私有化部署(单机 Docker Compose 即可跑通),预留 SaaS 多租户扩展能力。

完整产品定义见 [docs/iot-platform-prd.md](docs/iot-platform-prd.md)。

## 功能特性

- **组织与权限**:邀请码注册、JWT 登录、组织 / 角色 / 权限管理、操作审计
- **产品与设备**:产品管理、设备注册与凭证、设备分组、设备影子(期望值 / 上报值)、在线状态
- **设备接入**:MQTT(EMQX,支持 1883 / 8883 TLS)与 HTTP 两种方式,统一 topic 规范与签名鉴权
- **设备控制**:Web 控制台下发命令、指令状态跟踪(超时自动过期)、App 扫码绑定设备
- **OTA 升级**:固件包管理(MinIO 存储,支持增量固件)、升级任务(全量 / 定向设备)、升级结果追踪与超时处理
- **日志与监控**:设备日志、事件日志、审计日志、数据保留期自动清理、Dashboard 统计(echarts)
- **压力验证**:内置设备模拟器,支持 100–500 MQTT 连接的冒烟与压测脚本

## 架构

pnpm + turbo 管理的 monorepo:

```
ziot/
├── apps/
│   ├── web/      Next.js 16 全栈应用:管理控制台前端 + 全部 REST API(/api/v1)+ EMQX 认证/回调(/api/internal/emqx)
│   └── worker/   后台任务进程(BullMQ):遥测消费、设备事件、命令超时、OTA 记录超时、保留期清理
├── packages/
│   ├── db/               Prisma schema + client(PostgreSQL)
│   ├── domain/           共享领域逻辑(auth / control / devices / ota / signatures / topics)
│   ├── device-simulator/ 设备模拟器(冒烟 / 压测)
│   └── config/
├── deploy/       docker-compose(dev + prod)、nginx、EMQX 配置、证书脚本
└── docs/         PRD、API 文档、接入指南、部署指南、开发日志
```

**基础设施**:PostgreSQL 16(业务数据)· Redis 7(BullMQ 队列)· EMQX 5.10(MQTT 接入)· MinIO(固件存储)· Nginx + Certbot(生产 HTTPS)

## 快速开始

### 方式一:一键 Compose(推荐体验)

dev compose 内含全部 6 个服务(postgres、redis、emqx、minio、web、worker),web/worker 以源码挂载热更新:

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up -d

# 初始化数据库并写入种子数据(默认账号见 packages/db/prisma/seed.ts)
DATABASE_URL=postgresql://ziot:ziot@localhost:5432/ziot \
  pnpm --filter @ziot/db prisma:generate
DATABASE_URL=postgresql://ziot:ziot@localhost:5432/ziot \
  pnpm --filter @ziot/db seed
```

启动后:

| 服务 | 地址 |
| --- | --- |
| Web 控制台 / API | http://localhost:3000 |
| MQTT | localhost:1883 |
| EMQX Dashboard | http://localhost:18083(仅本机可访问,账号 `admin` / `public123`) |
| MinIO Console | http://localhost:9001(账号 `ziot` / `ziot-secret`) |

### 方式二:本地开发

只用 compose 起基础设施,应用进程跑在宿主机便于调试:

```bash
docker compose -f deploy/docker-compose.yml up -d postgres redis emqx minio

pnpm install
cp .env.example .env
DATABASE_URL=postgresql://ziot:ziot@localhost:5432/ziot \
  pnpm --filter @ziot/db exec prisma db push --schema prisma/schema.prisma
pnpm seed:demo   # 演示数据
pnpm dev         # turbo 并行启动 web + worker
```

## 部署指南

全部在 [docs/deployment/](docs/deployment/),按场景选择:

| 文档 | 适用场景 |
| --- | --- |
| [private-deployment.md](docs/deployment/private-deployment.md) | 单机私有化部署入门(2C4G 即可) |
| [production.md](docs/deployment/production.md) | 生产部署实录:HTTPS 域名 + MQTT TLS + Certbot 证书,可照抄复现 |
| [no-root-setup.md](docs/deployment/no-root-setup.md) | 无 root 权限服务器环境 |
| [lightweight-sizing.md](docs/deployment/lightweight-sizing.md) | 轻量资源配置(容器限额、PG / Redis 调优) |
| [backup-restore.md](docs/deployment/backup-restore.md) | 数据备份与恢复 |

生产编排 `deploy/docker-compose.prod.yml` 对外只暴露 80 / 443 / 1883 / 8883,内部组件全部走 compose 内网,凭证放 `deploy/prod.env`(已 gitignore)。

## 文档索引

- [产品 PRD](docs/iot-platform-prd.md) — 功能范围、角色与流程定义
- [API 文档](docs/api/) — 管理后台 API、App API、接入总览
- [设备接入指南](docs/device-integration/) — MQTT topic 规范、Python / C 示例、增量 OTA Demo
- [App 接入指南](docs/app-integration/) — 扫码绑定与 App 端 API
- [开发日志](docs/dev-logs/) — 按日期记录的设计决策与踩坑

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动 web + worker(热更新) |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | 构建 / 类型检查 / 代码检查 |
| `pnpm test` | 单元测试(vitest,含 worker 与中间件) |
| `pnpm seed:demo` | 写入演示数据 |
| `pnpm smoke` | 9 步冒烟测试(对本地或公网入口) |
| `pnpm smoke:lightweight` / `pressure:mvp` / `pressure:capacity` | 压测:100 / 300 / 500 MQTT 连接 |

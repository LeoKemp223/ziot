# 2026-04-28 本地数据库与产品接口验证日志

## 背景

本地开发阶段不使用 Docker，Docker 仅用于服务器部署。为验证产品管理后台和产品创建接口，需要在本机环境创建 PostgreSQL 数据库，并让 Next.js 开发服务连接本机数据库。

## 本地数据库

本机系统 PostgreSQL 已在 `localhost:5432` 运行，但当前系统用户 `leo` 没有 `createdb` / `createrole` 权限，无法在系统 PostgreSQL 中创建独立的 `ziot` 数据库和用户。

因此改为使用本机 PostgreSQL 12 二进制，在项目目录内初始化专用开发实例：

```bash
/usr/lib/postgresql/12/bin/initdb -D .runtime/postgres -U ziot --auth=trust --encoding=UTF8 --locale=C.UTF-8
/usr/lib/postgresql/12/bin/pg_ctl -D .runtime/postgres -l .runtime/postgres.log -o "-p 55432 -k /tmp" start
createdb -h localhost -p 55432 -U ziot ziot
```

数据库连接信息：

```text
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot
```

本地运行数据目录：

```text
.runtime/postgres
```

`.runtime/` 已加入 `.gitignore`，不会提交本地数据库文件。

## Prisma 同步与 Seed

执行 schema 校验：

```bash
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot pnpm --filter @ziot/db prisma:validate
```

执行 schema 推送：

```bash
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot pnpm --filter @ziot/db exec prisma db push --schema prisma/schema.prisma
```

执行 seed：

```bash
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot pnpm --filter @ziot/db seed
```

Seed 后数据量：

```text
organizations: 1
products: 1
devices: 2
users: 1
```

## Web 环境配置

新增本地 Web 环境文件：

```text
apps/web/.env.local
```

内容：

```env
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot
```

Next.js dev server 已重启，并确认加载 `.env.local`。

访问地址：

```text
http://localhost:3000
http://localhost:3000/products
```

## 产品创建接口验证

调用产品创建接口：

```bash
curl -s -w '\n%{http_code}\n' \
  -H 'content-type: application/json' \
  -X POST http://localhost:3000/api/v1/products \
  -d '{"product_key":"pk_test_1777367433","name":"接口测试产品","protocols":["mqtt"],"auth_type":"device_secret","data_format":"json"}'
```

结果：

```text
HTTP 201
code: 0
product_key: pk_test_1777367433
name: 接口测试产品
device_count: 0
```

数据库直查确认记录已落库：

```bash
psql -h localhost -p 55432 -U ziot -d ziot -Atqc \
  "select product_key, name, auth_type, data_format, jsonb_array_length(protocols::jsonb), deleted_at is null from products where product_key = 'pk_test_1777367433';"
```

结果：

```text
pk_test_1777367433|接口测试产品|device_secret|json|1|t
```

产品列表接口验证：

```bash
curl -s http://localhost:3000/api/v1/products
```

当前产品列表包含：

```text
pk_test_1777367433: 接口测试产品
test: test
pk_demo: 演示产品
```

## 当前状态

本地 PostgreSQL：

```text
localhost:55432 - accepting connections
```

产品 API：

```text
GET /api/v1/products: 可读取数据库产品列表
POST /api/v1/products: 可创建产品并落库
```

产品管理页面：

```text
http://localhost:3000/products
```

## 注意事项

- 本地开发不使用 Docker；服务器部署阶段再使用 `deploy/docker-compose.yml`。
- 当前已实现后台 API 文档见 `docs/api/admin-api.md`。
- 如果项目内 PostgreSQL 停止，可用以下命令重启：

```bash
/usr/lib/postgresql/12/bin/pg_ctl -D .runtime/postgres -l .runtime/postgres.log -o "-p 55432 -k /tmp" start
```

- 当前 `GET /api/v1/products?keyword=xxx` 只按产品名称搜索，不匹配 `product_key`。后续建议改为同时匹配 `name` 和 `product_key`。

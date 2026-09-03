# 2026-09-03 App 扫码绑定设备功能开发日志

## 背景

智能家居类手机 APP 接入需求:手机扫二维码绑定设备 → 控制设备 → 读取设备状态。

开发前现状梳理结论:

- **控制设备、读取状态**:服务端已具备,链路完整(`POST /api/v1/devices/{id}/commands(:sync)`、shadow、EMQX webhook 回链路),直接复用。
- **扫码绑定**:从数据模型到 API 到二维码规范完全不存在——Device 只有 `org_id` + `created_by`(审计字段),无用户-设备绑定概念;`getCurrentUser` 只读 httpOnly cookie,无 Bearer;注册强制邀请码。

已确认的方案决策:

1. 本轮完整实现(绑定 + 我的设备 + Bearer 认证),APP 本身不在范围。
2. App 用户走**独立体系**(新 `app_users` 表),与控制台 org/RBAC 隔离。
3. 绑定码由**控制台生成**:一次性、短 TTL、设备 secret 不上码。

## 数据模型

`packages/db/prisma/schema.prisma` 新增 4 表 + 2 枚举:

| 表 | 说明 |
| --- | --- |
| `app_users` | C 端用户:手机号唯一 + bcrypt 密码,开放注册 |
| `app_refresh_tokens` | App 独立刷新令牌(不复用 `refresh_tokens`,其 user_id FK 指向控制台 users) |
| `user_devices` | 绑定关系,多对多(家庭共享),`@@unique([app_user_id, device_id])`,解绑软删(status=unbound) |
| `device_binding_codes` | 一次性绑定码:code_hash(sha256)唯一索引、TTL、used_by、created_by(控制台用户) |

既有模型调整:

- `DeviceCommand.created_by` 改可空 + 新增 `app_user_id`(App 发起的命令);控制台查询 ownerFilter 仅在 userId 存在时生效,无回归。
- `AuditLog.user_id` 改可空 + 新增 `actor_type`(user / app_user),App 事件 org_id 用设备所属 org。

绑定码规范:格式 `BD` + 10 位去混淆大写字母数字(复用邀请码字母表,≈50bit 熵);明文不落库,仅生成响应返回一次;TTL 默认 15 分钟(clamp 1-60)。QR 内容 `${APP_BIND_QR_BASE_URL:-http://localhost:3000}/b/#{code}`,绑定码在 URL fragment,不进中间服务器日志。

## Schema 同步(踩坑)

本地库无 `_prisma_migrations` 表(历来用 `db push`),`prisma migrate dev` 会要求 reset 清库——**不要跑**。正确做法:

```bash
# 落库(纯增量,无损)
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot \
  pnpm --filter @ziot/db exec prisma db push --schema prisma/schema.prisma

# 补迁移文件(保持 git 里迁移链完整,Prisma 7 无 --shadow-database-url)
git show HEAD:packages/db/prisma/schema.prisma > /tmp/schema_old.prisma
pnpm --filter @ziot/db exec prisma migrate diff \
  --from-schema /tmp/schema_old.prisma --to-schema prisma/schema.prisma \
  --script -o prisma/migrations/20260903000000_add_app_users_device_binding/migration.sql

pnpm --filter @ziot/db run prisma:generate
```

## 新增代码

**App 认证**(`apps/web/lib/identity/`)
- `app-auth-service.ts`:注册/登录/刷新(旋转式)/登出;JWT 带 `utype:"app"` + `aud:"ziot-app"`,与控制台会话(同一 JWT_SECRET)**双向隔离**——`verifyAccessToken` 拒 `utype==="app"`,`verifyAppAccessToken` 要求之。tokens 走响应体,不用 cookie。
- `app-session.ts`:`getAppUser(request)` 解析 `Authorization: Bearer`。
- `rate-limit.ts`:Redis INCR+EXPIRE 固定窗口限流,故障 fail-open。`api-errors.ts` 加 `429001: 429`。

**绑定服务**(`apps/web/features/devices/binding-service.ts`):出码/列表/撤销/绑定/我的设备/别名/解绑。绑定执行用 `updateMany` 条件更新 + `count===1` **原子占用**防一次性码并发复用。

**路由**:
- App 侧 `/api/v1/app/**`:auth(register/login/refresh/logout)、me、devices/bind、devices(CRUD)、shadow、commands(:sync)、commands/{id}
- 控制台侧 `/api/v1/devices/{id}/binding-codes`(POST/GET/DELETE)、`bindings`(GET)

**控制台 UI**:`components/devices/device-binding-panel.tsx`,挂设备详情页——生成码(QR 图+明文+倒计时,权限 device:write)、码列表/撤销、已绑用户(手机号脱敏)。新增依赖 `qrcode`(仅服务端)。(⚠ 同日已被"设备列表行二维码弹窗"替换,面板删除,见文末《变更》一节)

**Worker**:`src/bindings/cleanup-binding-codes.ts` 定时清理过期/已用码(默认 10 分钟一次,保留 24h)。(⚠ 同日随永久码模型删除,见文末《变更》一节)

**审计**:`audit-service.ts` 支持 `appUser` actor;事件 `device.binding_code.*` / `app.auth.*` / `app.device.*`。

## 环境变更与坑

- **web dev server 已重启**(原进程持有旧 Prisma client,对新列 `app_user_id` 报 PrismaClientValidationError → 命令下发一律 500)。改 schema + `prisma:generate` 后**必须重启 next dev**,不会热加载。现以 nohup 运行,日志在 `.runtime/web-dev.log`。
- worker(tsx watch)自动重载,无需干预;冒烟中 MQTT 属性上报/影子写入正常,确认无影响。

## 验证

```text
pnpm typecheck   6/6 通过
pnpm test        138/138 通过(新增 app-auth/binding-service/rate-limit 测试,扩展 control-service/api-errors)
pnpm smoke       13 步全绿(新增:app 注册+登录 / 扫码绑定+设备列表 / 同步控制+影子 / 永久码共享+轮换+解绑)
```

以上为最终(永久码)模型的验证结果。手工 curl 链路(控制台查看永久码 → App 注册 → bind → 列表 → shadow → 轮换 → 旧码 400001 → 新码重绑 → 解绑)全部符合预期;无 token 401、**App 令牌与控制台令牌互不可用**(双向 401);`audit_logs` 落库 `actor_type=app_user` 的 bind/control/unbind 事件。

## 注意事项

- `pnpm lint` 在 master 上**预存在红**(全仓 ~76 个 `no-explicit-any`,stash 干净树复现同样报错),非本次引入;有效验证门是 typecheck/test/smoke。
- 生产部署需设置 `APP_BIND_QR_BASE_URL` 为 APP 可达域名(如 `https://www.ziot.asia`),否则二维码指向 localhost。
- App 端状态读取 MVP 为轮询 shadow;SSE 实时推送属性变化/上下线为未来扩展。
- App 端完整 API 文档见 `docs/api/app-api.md`,控制台侧追加见 `docs/api/admin-api.md` 第 7 节。

## 变更(同日):一次性绑定码 → 设备永久二维码

应产品要求调整绑定模型:**二维码永久有效、出厂印刷到产品上,用户收到设备扫码即绑**。当日上半天实现的一次性短时效码(15 分钟 TTL、单次有效)被以下方案替换:

| 维度 | 原方案(已废弃) | 现方案 |
| --- | --- | --- |
| 码性质 | 一次性,TTL 15 分钟 | 每设备一个,永不过期 |
| 存储 | `device_binding_codes` 表(sha256 哈希) | `devices.binding_code` 明文唯一列(与邀请码同级的"印在实物上的持有凭证",需支持反复查看/补打标签) |
| 熵 | BD+10(50bit) | BD+16(80bit,长期抗暴力) |
| 入口 | 设备详情页"设备绑定"面板(生成/倒计时/撤销) | **设备列表行"二维码"按钮弹窗**(查看/复制/重新生成/已绑用户) |
| 复用 | 原子占用防并发,一码一用 | 同码多用户可绑(家庭共享);轮换 = 旧码立即失效 |
| worker | 定时清理过期码 | 已删除(无过期概念) |

- Schema:`devices` 加 `binding_code`(unique)+ `binding_code_generated_at`,删 `device_binding_codes` 表与 `BindingCodeStatus` 枚举(迁移 `20260903100000_permanent_device_binding_code`,同样走 db push 落库)。
- 路由:删 `binding-codes` 三条;新增 `GET/POST /api/v1/devices/{id}/binding-code`(查看=懒生成 / 轮换,均需 `device:write`);`bindings` 列表保留,弹窗内展示。
- `bindDeviceByCode` 改为按明文唯一索引直查;单测重写(并抓出一个模板串 `${code}` 手误导致的真 bug——QR 内容会变成字面量 `{code}`)。
- 冒烟第 12 步改为:同码第二用户绑定成功(共享)→ 轮换 → 旧码 400001 → 新码重绑 → 解绑。
- 明文存储的安全权衡:绑定码是"持有即所有权"的物理凭证,与 `device_secret`(bcrypt,只显一次)不同类;轮换机制兜底泄露风险。

### 配套文档(同日新增/更新)

- 新建 **`docs/app-integration/integration-guide.md`**(APP 接入指南,面向 APP 开发人员):令牌存储与 401 刷新拦截器模式(旋转式 refresh 的并发单飞)、二维码 fragment 解析函数、绑定错误分支→用户提示对照表、轮询与 sync/async 控制实践、限流安全清单、端到端 curl 联调脚本。
- 控制台 **`/integration-docs` 接入文档页**新增"APP 接入流程"章节(认证/扫码绑定/状态/控制/完整文档指引),页面标题从"设备接入文档"改为"接入文档",概览卡片补 APP 用户体系与扫码绑定两张。
- `docs/api/app-api.md`(接口参考)、`docs/api/admin-api.md`(控制台侧端点)、`docs/api/integration-guide.md`(总索引加 Mobile App Access 节)同步更新;app-api.md 头部引导 APP 开发者先读接入指南。

### 事故与排障记录(同日)

1. **App 动态路由间歇 404**(`[deviceId]` 下 shadow/commands 全 404,静态 bind/list 正常,控制台同名路由正常):根因是**两个 next dev 实例同时在跑**(重复 `pnpm dev` 启动),各持新旧路由清单。解法:`pgrep -af next` 全杀 + `rm -rf apps/web/.next` + 单实例重启。中途清缓存时残留进程还在写,还引发一次 **Turbopack SST 缓存损坏**(panic + `Unable to open SST file`),同样靠全杀+清缓存解决。已记入 `no-root-setup.md` 踩坑清单。
2. **单测抓出真 bug**:QR 内容模板串写成 `#{code}`(少 `$`),二维码会编码字面量 `{code}`——重写测试的 `qr_content` 断言直接暴露,修复为 `${code}`。

### 变更后重新验证

typecheck 6/6、单测 138/138、冒烟 13 步全绿;手工 curl 覆盖懒生成→码稳定→绑定→轮换→旧码 400001→新码重绑→已绑用户列表(手机号脱敏)全链路。

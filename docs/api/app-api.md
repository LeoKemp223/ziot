# App 端 API 文档(扫码绑定 / 控制 / 状态)

版本：v0.2
更新日期：2026-09-03
当前状态：本文档记录已实现并验证的 App 端接口。App 用户是与控制台用户完全独立的体系(`app_users` 表),认证走 `Authorization: Bearer`,与控制台的 httpOnly Cookie 会话互不通用。

> **APP 开发人员请先读 `docs/app-integration/integration-guide.md`**(接入指南:令牌存储与刷新策略、二维码解析规范、SSE 与轮询实践、curl 联调脚本);本文是接口字段级参考。

## 1. 概览与绑定流程

智能家居类 App 的标准接入流程:

```text
┌────────────┐  1. 控制台查看设备永久二维码        ┌────────────┐
│ 控制台用户  │ ───────────────────────────────▶ │  ziot 平台  │
└────────────┘  (设备列表 → 二维码按钮,可印刷)   └─────┬──────┘
      │ 出厂印刷二维码到产品标签                         │
      ▼                                              ▼
┌────────────┐  2. 用户扫码取 fragment 中的绑定码     ┌────────────┐
│   手机 APP  │ ────────────────────────────────────▶ │  ziot 平台  │
│            │  3. POST /api/v1/app/devices/bind     │            │
│            │ ◀──────────────────────────────────── │ 建立 user_devices 绑定
└─────┬──────┘                                      └─────┬──────┘
      │ 4. SSE 订阅状态 / 控制设备 / 读影子 / 改别名 / 解绑
      ▼                                              ▼
```

- **设备绑定码是永久的**:每台设备一个,格式 `BD` + 16 位去混淆大写字母数字(如 `BD7K2M9XQ4ABCDEFGH`,80bit 熵),永不过期。控制台在设备列表行点"二维码"按钮查看,二维码可印刷到产品上,用户拿到设备扫码即绑。
- 同一张码可被**多个 App 用户重复使用**(家庭共享,一人一码全家可扫)。
- 二维码内容:`${APP_BIND_QR_BASE_URL}/b/#{code}`(如 `https://www.ziot.asia/b/#BD7K2M9XQ4ABCDEFGH`)。绑定码放在 URL fragment(`#` 之后),不会进入任何中间服务器的访问日志。APP 解析 fragment 取 code。
- 码泄露时控制台可"重新生成"(轮换):旧码立即失效,已印刷的旧标签作废,新码可重新印刷。
- 设备 `device_secret` 永远不出现在二维码上。
- 解绑后再扫同一张码可重新绑定。

## 2. 统一响应包络与错误码

**所有** `/api/v1/app/**` 接口(除 SSE 流)返回统一 JSON 包络:

```json
// 成功:code = 0,data 为业务数据(DELETE 类接口可能是 {} 或 null)
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": { "...": "业务数据" }
}

// 失败:HTTP 状态码与 code 一致,data 恒为 null
{
  "code": 401001,
  "message": "缺少访问令牌",
  "request_id": "req_xxx",
  "data": null
}
```

完整错误码表(`message` 为中文描述,可直连展示;`request_id` 用于向平台反馈问题):

| code | HTTP | 场景 |
| --- | --- | --- |
| `0` | 200/201 | 成功 |
| `400001` | 400 | 参数错误:手机号/密码/别名格式不合法、绑定码格式错误或不存在(含已被轮换的旧码、已删除设备,统一返回此码防枚举)、JSON 体不合法等 |
| `401001` | 401 | 未登录 / access_token 缺失或过期 / refresh_token 无效、已吊销或过期 / 账号或密码错误 |
| `403001` | 403 | 账号已禁用 / 设备已禁用 / 未绑定该设备就访问其子资源 |
| `404001` | 404 | 设备或命令不存在(含曾绑定但已解绑) |
| `409001` | 409 | 手机号已注册 |
| `429001` | 429 | 请求过于频繁(注册 5/分/IP、登录 10/分/IP、绑定 20/分/用户) |
| `500001` | 500 | 服务器内部错误(`message` 固定为"服务器内部错误",细节看服务端日志) |

## 3. 认证

### 3.1 App 用户注册(开放,无需邀请码)

`POST /api/v1/app/auth/register`

限流:5 次/分钟/IP(`429001`)。

请求体:

```json
{
  "phone": "13912345678",
  "password": "Pass1234",
  "nickname": "小明"
}
```

- `phone`:大陆手机号 `1[3-9]\d{9}`,唯一;已注册返回 `409001`。
- `password`:8-128 位。
- `nickname`:可选,1-128 位,缺省为 `用户` + 手机尾 4 位。

响应 `data`:

```json
{
  "user": {
    "id": "app_xxx",
    "phone": "13912345678",
    "nickname": "小明",
    "status": "active",
    "created_at": "2026-09-03T08:00:00.000Z"
  },
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "art_xxx",
  "access_token_expires_at": "2026-09-03T08:15:00.000Z",
  "refresh_token_expires_at": "2026-10-03T08:00:00.000Z"
}
```

令牌在响应体返回,APP 自行存储(建议 Keychain/Keystore);**不使用 Cookie**。登录/刷新的响应结构与本节完全相同,下文不再重复。

### 3.2 登录

`POST /api/v1/app/auth/login`

限流:10 次/分钟/IP。请求体:

```json
{
  "phone": "13912345678",
  "password": "Pass1234"
}
```

响应 `data` 同注册(3.1)。账号或密码错误返回 `401001`,账号禁用返回 `403001`。

### 3.3 刷新令牌(旋转式)

`POST /api/v1/app/auth/refresh`

请求体:

```json
{
  "refresh_token": "art_xxx"
}
```

响应 `data` 同注册(3.1),但 `access_token` / `refresh_token` 都是新签发的。**旧 `refresh_token` 在本次刷新成功后立即吊销**——APP 必须原子地替换存储,收到 `401001` 时应引导用户重新登录。

- access_token:JWT,15 分钟,声明 `utype: "app"` + `aud: "ziot-app"`,与控制台会话(同一 `JWT_SECRET`)双向隔离,互不可用。
- refresh_token:30 天,不透明随机串(`art_` 前缀),服务端只存 sha256。

### 3.4 登出

`POST /api/v1/app/auth/logout`

请求体:

```json
{
  "refresh_token": "art_xxx"
}
```

吊销该刷新令牌。响应 `data` 为 `{}`。access_token 未过期前仍有效(最多 15 分钟),介意可由 APP 端立即丢弃。

### 3.5 当前用户

`GET /api/v1/app/me`,请求头 `Authorization: Bearer <access_token>`,返回 3.1 中的 `user` 对象。

### 3.6 修改密码

`POST /api/v1/app/auth/change-password`,请求头 `Authorization: Bearer <access_token>`。限流:10 次/分钟/IP。

请求体:

```json
{
  "old_password": "Pass1234",
  "new_password": "NewPass5678"
}
```

- `new_password`:8-128 位;`old_password` 错误返回 `401001`(提示「原密码不正确」)。
- 成功行为:更新密码 → **吊销该用户全部 refresh_token(其它设备全部登出,它们下次刷新会收到 `401001`)** → 响应 `data` 为**新签发的会话**(结构同 3.1),当前设备原子替换本地令牌后无感续用。
- 写入审计日志 `app.auth.change_password`。

## 4. 扫码绑定

### `POST /api/v1/app/devices/bind`

请求头:`Authorization: Bearer <access_token>`。限流 20 次/分钟/用户。

请求体:

```json
{
  "code": "BD7K2M9XQ4ABCDEFGH"
}
```

输入自动 trim + 转大写,支持手动输码兜底。永久码可多次使用(家庭共享)。

成功响应 `data` 为[设备对象](#设备对象-device),见下文字段表。错误:绑定码格式不正确/不存在(含已被轮换的旧码、已删除设备)`400001`(防枚举)、设备已禁用 `403001`。

### 设备对象(Device)

`bind` 的响应、`GET /api/v1/app/devices` 的列表项、`PATCH .../devices/{id}` 的响应均为同一结构(解绑响应除外):

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `device_id` | `string` | 设备 ID,**所有子资源路径用它**(不是 `device_key`) |
| `alias` | `string \| null` | 当前用户起的别名,`null` = 未设置(展示时回退 `name`) |
| `name` | `string` | 控制台侧设备名称 |
| `product_id` | `string` | 产品 ID |
| `product_name` | `string` | 产品名称 |
| `product_key` | `string` | 产品标识(`pk_` 前缀) |
| `device_key` | `string` | 设备标识(`dk_` 前缀) |
| `status` | `"active" \| "disabled"` | 设备启用状态 |
| `online_status` | `"online" \| "offline" \| "unknown"` | 实时在线状态 |
| `firmware_version` | `string \| null` | 固件版本(OTA 上报后更新) |
| `bound_at` | `string`(ISO 8601) | 本次绑定时间 |
| `shadow_reported` | `object` | 影子 `reported` 快照 = 设备最近上报的属性全集;`{}` = 尚无上报 |
| `shadow_updated_at` | `string \| null` | 影子最后更新时间 |

TypeScript 参考:

```ts
interface AppDevice {
  device_id: string;
  alias: string | null;
  name: string;
  product_id: string;
  product_name: string;
  product_key: string;
  device_key: string;
  status: "active" | "disabled";
  online_status: "online" | "offline" | "unknown";
  firmware_version: string | null;
  bound_at: string;
  shadow_reported: Record<string, unknown>;
  shadow_updated_at: string | null;
}
```

## 5. 我的设备

### `GET /api/v1/app/devices`

返回当前用户全部有效绑定:

```json
{
  "items": [
    { "device_id": "dev_xxx", "alias": null, "name": "客厅空调", "...": "其余字段同设备对象" }
  ]
}
```

`items` 为设备对象数组(可能为空数组)。设备离线时 `online_status` 变 `offline`,快照字段保留最近值。

### `PATCH /api/v1/app/devices/{deviceId}`

改设备别名。请求体:

```json
{
  "alias": "客厅的空调"
}
```

`alias` 1-128 位,传空串 `""` 清除别名(回到 `null`)。响应 `data` 为更新后的设备对象。无有效绑定返回 `404001`,格式非法返回 `400001`。

### `DELETE /api/v1/app/devices/{deviceId}`(解绑)

解绑当前用户与该设备的绑定(软删除,绑定历史保留,再扫同一张码可重新绑定;不影响其他用户的绑定)。**设备管理页必备**。

响应 `data`:

```json
{
  "device_id": "dev_xxx",
  "org_id": "org_xxx",
  "unbound_at": "2026-09-03T09:00:00.000Z"
}
```

无有效绑定(或已解绑过)返回 `404001`。解绑后对该设备的 shadow/commands 等子资源访问返回 `403001`。

## 6. 设备状态:影子 + 实时事件流

### 6.1 影子(拉)

`GET /api/v1/app/devices/{deviceId}/shadow`

设备影子 `reported` 是设备最近一次上报的属性全集(设备端 `property/post` → 平台合并):

```json
{
  "device_id": "dev_xxx",
  "reported": { "temperature": 24.5, "humidity": 60 },
  "desired": { "temperature": 22 },
  "version": 12,
  "updated_at": "2026-09-03T07:59:30.000Z"
}
```

`version` 单调递增,可用于变更检测。`desired` 是期望值(通常与最近一次 property_set 一致)。

### 6.2 事件流(推,SSE)

`GET /api/v1/app/events/stream`

请求头:`Authorization: Bearer <access_token>`(仅**建立连接时**校验一次)。响应 `content-type: text/event-stream`,长连接持续推送。

**只推送当前用户有效绑定的设备**,绑定集每 60 秒重载(连接期间新绑定/解绑自动生效)。**无历史重放**:断线重连后请先拉一次 `GET /api/v1/app/devices` + shadow 对齐状态,再继续收流。

事件类型:

| event | data | 说明 |
| --- | --- | --- |
| `ready` | `{ "device_ids": ["dev_xxx"] }` | 连接建立后的初始事件,列出当前会推送的设备 |
| `device.shadow.updated` | `{ "type": "...", "device_id": "...", "reported": {...}, "version": 12, "updated_at": "ISO" }` | 设备属性上报合并进影子后推送 |
| `device.status.changed` | `{ "type": "...", "device_id": "...", "online_status": "online", "occurred_at": "ISO" }` | 设备真实上下线翻转时推送 |
| `heartbeat` | `{ "now": "ISO" }` | 每 20 秒一次,保活(反代不超时断连) |
| `error` | `{ "message": "..." }` | 服务端内部异常(连接保持) |

帧示例:

```text
event: device.shadow.updated
data: {"type":"device.shadow.updated","device_id":"dev_xxx","reported":{"temperature":24.5},"version":12,"updated_at":"2026-09-03T07:59:30.000Z"}

event: device.status.changed
data: {"type":"device.status.changed","device_id":"dev_xxx","online_status":"online","occurred_at":"2026-09-03T08:00:00.000Z"}
```

客户端注意:

- 浏览器原生 `EventSource` **不支持自定义请求头**,请用 fetch 流式读取或带 header 的 SSE 库(如 `event-source-polyfill`、OkHttp/`URLSession` 自行解析)。
- 服务端已输出 `x-accel-buffering: no`,自建 nginx 反代时确认未开启缓冲。
- 该接口依赖平台配置 `REDIS_URL`;未配置时返回 `500001`。

### 6.3 推荐的状态同步策略

前台页面:优先 SSE(6.2)实时刷新;轮询降级兜底(3-10s,`version` 变了才刷 UI)。后台/进程被杀:停止拉流,需要通知用户的场景接厂商推送通道(平台后续规划)。

## 7. 控制设备

### `POST /api/v1/app/devices/{deviceId}/commands`(异步)

body:

```json
{
  "kind": "service",
  "identifier": "reboot",
  "params": {},
  "timeout_ms": 15000
}
```

- `kind`: `service`(服务调用,需 `identifier`,字母/下划线开头 1-128 位)或 `property_set`(属性设置,不需要 `identifier`)。
- `params`:JSON 对象。
- `timeout_ms`:1000-120000,默认 15000。**传输语义下仅兼容保留,新命令创建即终态,该参数不再影响结果。**

返回 201 + 命令对象。命令状态只反映**投递结果**:EMQX 发布成功即 `success`,发布失败(重试耗尽)即 `failed`,不等设备业务应答。设备是否真正执行,通过 SSE `device.shadow.updated` / 影子 `reported` 或设备日志判断。

### `POST /api/v1/app/devices/{deviceId}/commands:sync`(同步)

body 同上。投递完成即返回终态命令对象(通常几十毫秒内),接口兼容保留给既有调用方。

### `GET /api/v1/app/commands/{commandId}`

命令详情,仅命令发起者或对该设备仍有有效绑定的用户可查。

命令状态机:`pending → success / failed`(投递语义)。存量历史命令可能出现 `sent`/`timeout`(旧版等待设备应答的语义)。

## 8. 控制台侧配套接口(设备永久二维码)

控制台用户(Cookie 会话 + RBAC)专用。入口:设备列表行"二维码"按钮(弹窗展示二维码/绑定码/已绑用户,并支持重新生成):

| Method | Path | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/devices/{id}/binding-code` | `device:write` | 查看设备永久绑定码 + 二维码;首次查看时自动生成。返回 `{ device_id, code, qr_content, qr_data_url, generated_at }` |
| POST | `/api/v1/devices/{id}/binding-code` | `device:write` | 轮换:生成新码,旧码立即失效(已印刷旧标签作废)。响应同上;审计 `device.binding_code.rotate` |
| GET | `/api/v1/devices/{id}/bindings` | `device:read` | 已绑 App 用户列表(手机号脱敏 `138****5678`) |

## 9. 快速验证(curl)

```bash
# 1. 控制台查看设备永久二维码(先用浏览器登录控制台拿 Cookie,或走登录接口)
curl http://localhost:3000/api/v1/devices/<devId>/binding-code \
  -b 'ziot_access_token=<console-token>'
# 记下 data.code(永久有效;需要作废旧码时改 POST 同路径 = 轮换)

# 2. App 注册(登录把 register 换成 login,body 为 {phone,password};
#    刷新用 {refresh_token};改密用 {old_password,new_password} + Bearer)
curl -X POST http://localhost:3000/api/v1/app/auth/register \
  -H 'content-type: application/json' \
  -d '{"phone":"13912345678","password":"Pass1234","nickname":"小明"}'
# 记下 data.access_token

# 3. 扫码绑定 / 我的设备 / 解绑
curl -X POST http://localhost:3000/api/v1/app/devices/bind \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $AT" -d '{"code":"BDXXXXXXXXXXXXXXXX"}'
curl http://localhost:3000/api/v1/app/devices -H "Authorization: Bearer $AT"
curl -X DELETE http://localhost:3000/api/v1/app/devices/<devId> -H "Authorization: Bearer $AT"

# 4. 影子 / 同步控制
curl http://localhost:3000/api/v1/app/devices/<devId>/shadow -H "Authorization: Bearer $AT"
curl -X POST http://localhost:3000/api/v1/app/devices/<devId>/commands:sync \
  -H 'content-type: application/json' -H "Authorization: Bearer $AT" \
  -d '{"kind":"service","identifier":"reboot","params":{}}'

# 5. 实时事件流(设备上报属性/上下线时打印推送)
curl -N http://localhost:3000/api/v1/app/events/stream -H "Authorization: Bearer $AT"
```

## 10. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `APP_BIND_QR_BASE_URL` | `http://localhost:3000` | 二维码内容前缀,生产应设为 APP 可达域名(如 `https://www.ziot.asia`) |
| `REDIS_URL`(web 侧) | 未配置则 SSE 不可用 | 设备事件总线(pub/sub)。web 服务需配置,未配置时 `/app/events/stream` 返回 `500001` |

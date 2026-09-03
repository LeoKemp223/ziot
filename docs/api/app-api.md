# App 端 API 文档(扫码绑定 / 控制 / 状态)

版本：v0.1
更新日期：2026-09-03
当前状态：本文档记录已实现并验证的 App 端接口。App 用户是与控制台用户完全独立的体系(`app_users` 表),认证走 `Authorization: Bearer`,与控制台的 httpOnly Cookie 会话互不通用。

> **APP 开发人员请先读 `docs/app-integration/integration-guide.md`**(接入指南:令牌存储与刷新策略、二维码解析规范、轮询与控制实践、curl 联调脚本);本文是接口字段级参考。

## 1. 概览与绑定流程

智能家居类 App 的标准接入流程:

```text
┌────────────┐  1. 控制台查看设备永久二维码        ┌────────────┐
│ 控制台用户  │ ───────────────────────────────▶ │  ziot 平台  │
└────────────┘  (设备列表 → 二维码按钮,可印刷)   └─────┬──────┘
      │ 出厂印刷二维码到产品标签                         │
      ▼                                              │
┌────────────┐  2. 用户扫码取 fragment 中的绑定码     │
│   手机 APP  │ ────────────────────────────────────▶ │
│            │  3. POST /api/v1/app/devices/bind     │
│            │ ◀──────────────────────────────────── │ 建立 user_devices 绑定
└─────┬──────┘                                      │
      │ 4. 控制设备 / 读状态 / 改别名 / 解绑          │
      ▼                                              ▼
```

- **设备绑定码是永久的**:每台设备一个,格式 `BD` + 16 位去混淆大写字母数字(如 `BD7K2M9XQ4ABCDEFGH`,80bit 熵),永不过期。控制台在设备列表行点"二维码"按钮查看,二维码可印刷到产品上,用户拿到设备扫码即绑。
- 同一张码可被**多个 App 用户重复使用**(家庭共享,一人一码全家可扫)。
- 二维码内容:`${APP_BIND_QR_BASE_URL}/b/#{code}`(如 `https://www.ziot.asia/b/#BD7K2M9XQ4ABCDEFGH`)。绑定码放在 URL fragment(`#` 之后),不会进入任何中间服务器的访问日志。APP 解析 fragment 取 code。
- 码泄露时控制台可"重新生成"(轮换):旧码立即失效,已印刷的旧标签作废,新码可重新印刷。
- 设备 `device_secret` 永远不出现在二维码上。
- 解绑后再扫同一张码可重新绑定。

## 2. 认证

### 2.1 App 用户注册(开放,无需邀请码)

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

响应 `data`(令牌在响应体返回,APP 自行存储;不使用 Cookie):

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

### 2.2 登录

`POST /api/v1/app/auth/login`,body `{ "phone": "...", "password": "..." }`。限流 10 次/分钟/IP。响应同上。账号或密码错误返回 `401001`,账号禁用返回 `403001`。

### 2.3 刷新令牌(旋转式)

`POST /api/v1/app/auth/refresh`,body `{ "refresh_token": "art_xxx" }`。旧 refresh_token 每次刷新后立即吊销并下发新的一对令牌。无效/已吊销/已过期返回 `401001`。

- access_token:JWT,15 分钟,声明 `utype: "app"` + `aud: "ziot-app"`,与控制台会话(同一 `JWT_SECRET`)双向隔离,互不可用。
- refresh_token:30 天,不透明随机串,服务端只存 sha256。

### 2.4 登出

`POST /api/v1/app/auth/logout`,body `{ "refresh_token": "art_xxx" }`,吊销该刷新令牌。

### 2.5 当前用户

`GET /api/v1/app/me`,请求头 `Authorization: Bearer <access_token>`,返回注册响应中的 `user` 对象。

## 3. 扫码绑定

### `POST /api/v1/app/devices/bind`

请求头:`Authorization: Bearer <access_token>`。限流 20 次/分钟/用户。

请求体:

```json
{
  "code": "BD7K2M9XQ4ABCDEFGH"
}
```

输入自动 trim + 转大写,支持手动输码兜底。永久码可多次使用(家庭共享)。

成功响应 `data`(绑定后的设备对象):

```json
{
  "device_id": "dev_xxx",
  "alias": null,
  "name": "客厅空调",
  "product_id": "prd_xxx",
  "product_name": "智能空调",
  "product_key": "pk_xxx",
  "device_key": "dk_xxx",
  "status": "active",
  "online_status": "online",
  "firmware_version": "1.0.0",
  "bound_at": "2026-09-03T08:00:00.000Z",
  "shadow_reported": { "temperature": 24.5 },
  "shadow_updated_at": "2026-09-03T07:59:30.000Z"
}
```

错误:码格式不正确/不存在(含已被轮换的旧码、已删除设备)`400001`(防枚举)、设备已禁用 `403001`。

## 4. 我的设备

### `GET /api/v1/app/devices`

返回当前用户全部有效绑定(含设备在线状态与 reported 影子快照):

```json
{
  "items": [ { "device_id": "...", "alias": "...", "...": "同 bind 响应" } ]
}
```

### `PATCH /api/v1/app/devices/{deviceId}`

改设备别名。body `{ "alias": "客厅的空调" }`,1-128 位,传空串清除。无绑定返回 `404001`。

### `DELETE /api/v1/app/devices/{deviceId}`

解绑(软删除,绑定历史保留,可重新扫码绑定)。

## 5. 读取设备状态

### `GET /api/v1/app/devices/{deviceId}/shadow`

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

设备在线状态看 `GET /api/v1/app/devices` 列表里的 `online_status`(`online` / `offline` / `unknown`)。

> MVP 采用轮询(建议 3-10s)。SSE 实时推送属性变化与上下线事件是规划中的扩展,当前 `/api/v1/events/stream` 仅面向控制台且只推命令状态。

## 6. 控制设备

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

返回 201 + 命令对象。命令状态只反映**投递结果**:EMQX 发布成功即 `success`,发布失败(重试耗尽)即 `failed`,不等设备业务应答。设备是否真正执行,请通过属性上报/影子(`reported`)或设备日志判断。

### `POST /api/v1/app/devices/{deviceId}/commands:sync`(同步)

body 同上。投递完成即返回终态命令对象(通常几十毫秒内),接口兼容保留给既有调用方。

### `GET /api/v1/app/commands/{commandId}`

命令详情,仅命令发起者或对该设备仍有有效绑定的用户可查。

命令状态机:`pending → success / failed`(投递语义)。存量历史命令可能出现 `sent`/`timeout`(旧版等待设备应答的语义)。

## 7. 错误码汇总(App 侧新增)

| code | HTTP | 说明 |
| --- | --- | --- |
| `400001` | 400 | 参数错误(含绑定码格式/无效) |
| `401001` | 401 | 未登录 / 令牌失效 / 账号或密码错误 |
| `403001` | 403 | 账号禁用 / 未绑定该设备 / 设备禁用 |
| `404001` | 404 | 设备或命令不存在 |
| `409001` | 409 | 手机号已注册 |
| `429001` | 429 | 请求过于频繁(注册/登录/绑定限流) |
| `500001` | 500 | 服务器内部错误 |

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

# 2. App 注册
curl -X POST http://localhost:3000/api/v1/app/auth/register \
  -H 'content-type: application/json' \
  -d '{"phone":"13912345678","password":"Pass1234","nickname":"小明"}'
# 记下 data.access_token

# 3. 扫码绑定
curl -X POST http://localhost:3000/api/v1/app/devices/bind \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $AT" -d '{"code":"BDXXXXXXXXXXXXXXXX"}'

# 4. 我的设备 / 影子 / 同步控制
curl http://localhost:3000/api/v1/app/devices -H "Authorization: Bearer $AT"
curl http://localhost:3000/api/v1/app/devices/<devId>/shadow -H "Authorization: Bearer $AT"
curl -X POST http://localhost:3000/api/v1/app/devices/<devId>/commands:sync \
  -H 'content-type: application/json' -H "Authorization: Bearer $AT" \
  -d '{"kind":"service","identifier":"reboot","params":{}}'
```

## 10. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `APP_BIND_QR_BASE_URL` | `http://localhost:3000` | 二维码内容前缀,生产应设为 APP 可达域名(如 `https://www.ziot.asia`) |

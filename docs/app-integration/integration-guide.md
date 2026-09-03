# APP 接入指南(智能家居 / 扫码绑定)

面向手机 APP(以及小程序等客户端)开发人员。完整接口字段与错误码参考见 `docs/api/app-api.md`,本文只讲**怎么用**。

## 1. 体系概览

```text
App 用户(手机号+密码,开放注册,无需邀请码)
   │  Authorization: Bearer <access_token>(JWT,15 分钟)
   ▼
/api/v1/app/**  ──扫码绑定──▶ user_devices ──▶ 设备(控制 / 状态)
```

- App 用户与控制台用户是完全独立的两套体系,令牌互不通用。
- 一个设备可被多个 App 用户绑定(家庭共享);App 用户只能访问自己绑定的设备。
- 所有响应是统一 envelope:`{"code": 0, "message": "ok", "request_id": "...", "data": ...}`,`code !== 0` 即失败。

本地开发 Base URL:`http://localhost:3000`;生产以实际域名为准(HTTPS)。

## 2. 用户与令牌

### 2.1 注册 / 登录

```text
POST /api/v1/app/auth/register   {"phone":"13912345678","password":"Pass1234","nickname":"小明"}
POST /api/v1/app/auth/login      {"phone":"13912345678","password":"Pass1234"}
```

响应 `data` 同时携带 `access_token`(15 分钟)和 `refresh_token`(30 天)。**令牌走响应体,服务端不下发 Cookie**——APP 自行存储(建议 iOS Keychain / Android Keystore,不要放明文 SharedPreferences 或本地 JSON)。

### 2.2 401 处理与刷新(旋转式)

`refresh_token` 是**一次性**的:每次刷新旧 token 立即作废并下发新的一对。推荐实现:

```text
请求失败 code=401001
  → 用本地 refresh_token 调 POST /api/v1/app/auth/refresh
  → 成功:用新 token 对重放原请求
  → 失败(refresh 也 401):清空本地会话,跳登录页
```

注意:
- **并发请求同时 401 时只发起一次刷新**(加锁/单飞),其余请求等待新 token,否则会出现旧 refresh_token 被自己人消费掉导致互踢。
- 密码修改、登出、服务端吊销都会使刷新失败,统一按"会话过期"处理。
- `POST /api/v1/app/auth/logout` 传当前 refresh_token,用于主动登出(丢弃本地令牌即可,logout 只是服务端吊销)。

## 3. 扫码绑定

### 3.1 二维码内容规范

设备二维码是**永久的**(每台设备一个,出厂印刷在产品标签上,用户收到即可扫码绑定)。内容是一个 URL:

```text
https://www.ziot.asia/b/#BD7K2M9XQ4ABCDEFGH
└────────┬────────┘└┘└───────┬────────┘
   APP 可达域名      固定路径   绑定码(URL fragment,16 位)
```

解析规则:

```ts
function parseBindQr(url: string): string | null {
  const marker = "/b/#";
  const index = url.indexOf(marker);
  return index >= 0 ? url.slice(index + marker.length).trim().toUpperCase() : null;
}
```

- 绑定码在 `#` 之后(fragment),**不会经过任何中间服务器**,扫码 SDK 返回的原始字符串直接本地解析,不要发起对该 URL 的网络请求。
- 码格式 `BD` + 16 位去混淆大写字母数字(无 0/O/1/I),已全大写;手动输码兜底时同样自动转大写。
- 码**永不过期**,且同一张码可被多个用户扫描绑定(家庭共享:一人一码,全家可扫)。
- 控制台可对设备"重新生成"绑定码(轮换):旧码立即失效。APP 收到旧码的 `400001` 时提示"二维码已失效,请联系设备管理员重新印刷"。

### 3.2 绑定与错误分支

```text
POST /api/v1/app/devices/bind   {"code":"BD7K2M9XQ4ABCDEFGH"}   (Bearer)
```

| 场景 | code | APP 提示建议 |
| --- | --- | --- |
| 码不存在 / 输错 / 已被轮换的旧码 | `400001` | "绑定码无效"(服务端防枚举,统一提示;若确认扫的是印刷码则提示联系管理员) |
| 设备被平台禁用 | `403001` | "设备不可用,请联系管理员" |
| 操作太快 | `429001` | 稍后重试(限流 20 次/分钟/用户) |

绑定成功返回设备对象(含 `online_status`、`shadow_reported` 快照),可直接进入设备首页。**解绑后再扫同一张码可重新绑定**;换手机/换账号直接扫印刷在设备上的码即可。

## 4. 读取设备状态

- **在线状态**:`GET /api/v1/app/devices` 列表里的 `online_status`(`online` / `offline` / `unknown`)。
- **属性状态**:`GET /api/v1/app/devices/{id}/shadow` 的 `reported` = 设备最近上报的属性全集(如 `{"temperature":24.5,"humidity":60}`);`desired` = 期望值(通常与最近一次 property_set 一致);`version` 单调递增可做变更检测。

轮询建议:MVP 阶段 APP 拉取即可,**前台 3-10s、后台停止**;配合 `version`/`updated_at` 判断有无变化再刷 UI。SSE 实时推送是规划中的扩展(见 app-api.md 第 5 节),接口形态届时保持向下兼容。

## 5. 控制设备

两种下发方式,请求体相同(`kind`/`identifier`/`params`/`timeout_ms`):

| 方式 | 路径 | 适用 |
| --- | --- | --- |
| 同步(推荐先做) | `POST .../commands:sync` | "点开关"类交互:投递完成即返回终态(通常几十毫秒),UI 上配合 loading 即可 |
| 异步 | `POST .../commands` | 批量/不关心即时结果的场景:返回 201 + 命令 id,用 `GET /api/v1/app/commands/{id}` 查询 |

命令状态机(投递语义):`pending → success | failed`。`success` = 平台已成功投递到 MQTT Broker,**不代表设备已执行**;`failed` = 发布失败,看 `error_message`。要确认设备实际状态,轮询 `GET .../devices/{id}/shadow` 看 `reported`(设备属性上报)是否收敛到设置值。存量历史命令可能出现 `sent`/`timeout`(旧版等待设备应答的语义)。

参数规则:
- `kind: "service"` 需 `identifier`(设备物模型服务标识,如 `reboot`,字母/下划线开头)。
- `kind: "property_set"` 不需要 `identifier`,`params` 为属性对象(如 `{"power":true}`),同时会写入影子 desired。
- `params` 必须是 JSON 对象;`timeout_ms` 1000-120000,默认 15000(传输语义下仅兼容保留,不再影响结果)。

**identifier 与 params 的取值由产品/固件定义**——APP 端每个产品的控制面板需按产品约定传参,拿不到约定时找设备侧开发人员对齐(设备侧话题定义见 `docs/device-integration/integration-guide.md`)。

## 6. 别名与解绑

```text
PATCH  /api/v1/app/devices/{id}   {"alias":"客厅的空调"}   空串清除,1-128 位
DELETE /api/v1/app/devices/{id}                            解绑(仅影响自己,其他家庭成员不受影响)
```

## 7. 限流与安全

- 限流(超限 `429001`,退避重试):注册 5/min/IP、登录 10/min/IP、绑定 20/min/用户。
- 全部接口走 HTTPS(生产);`access_token` 只放内存 + 安全存储,不进 URL、不进日志。
- 设备凭证(`device_secret`)永远不会出现在二维码或任何 App API 响应中,APP 无需也不应接触它。
- 服务端时钟以 `request_id`/ISO 时间为准,客户端显示时间注意时区。

## 8. 端到端联调脚本(curl)

```bash
BASE=http://localhost:3000
# ① 控制台查看设备永久二维码(设备列表行"二维码"按钮;或控制台用户 Cookie 调
#    GET $BASE/api/v1/devices/<devId>/binding-code 拿到 code)
# ② APP 注册拿令牌
AT=$(curl -s -X POST $BASE/api/v1/app/auth/register -H 'content-type: application/json' \
  -d '{"phone":"13900001111","password":"Pass1234","nickname":"测试"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")
# ③ 扫码绑定
curl -s -X POST $BASE/api/v1/app/devices/bind -H "Authorization: Bearer $AT" \
  -H 'content-type: application/json' -d '{"code":"BDXXXXXXXXXXXXXXXX"}'
# ④ 我的设备 / 状态
curl -s $BASE/api/v1/app/devices -H "Authorization: Bearer $AT"
curl -s $BASE/api/v1/app/devices/<devId>/shadow -H "Authorization: Bearer $AT"
# ⑤ 控制(同步)
curl -s -X POST $BASE/api/v1/app/devices/<devId>/commands:sync \
  -H "Authorization: Bearer $AT" -H 'content-type: application/json' \
  -d '{"kind":"service","identifier":"reboot","params":{}}'
```

本地全链路也可以直接跑 `pnpm smoke`(覆盖注册→绑定→同步控制→影子→复用拒绝→解绑)。

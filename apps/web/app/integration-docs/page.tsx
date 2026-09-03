import { BookOpen, KeyRound, RadioTower, Smartphone } from "lucide-react";
import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";

export const dynamic = "force-dynamic";

const mqttTopics = [
  {
    name: "属性上报",
    direction: "设备发布",
    topic: "/sys/{product_key}/{device_key}/thing/property/post"
  },
  {
    name: "事件上报",
    direction: "设备发布",
    topic: "/sys/{product_key}/{device_key}/thing/event/post"
  },
  {
    name: "日志上报",
    direction: "设备发布",
    topic: "/sys/{product_key}/{device_key}/thing/log/post"
  },
  {
    name: "属性设置下发",
    direction: "设备订阅",
    topic: "/sys/{product_key}/{device_key}/thing/property/set"
  },
  {
    name: "属性设置应答（可选）",
    direction: "设备发布",
    topic: "/sys/{product_key}/{device_key}/thing/property/set_reply"
  },
  {
    name: "服务调用下发",
    direction: "设备订阅",
    topic: "/sys/{product_key}/{device_key}/thing/service/+/invoke"
  },
  {
    name: "服务调用回复（可选）",
    direction: "设备发布",
    topic: "/sys/{product_key}/{device_key}/thing/service/{identifier}/reply"
  },
  {
    name: "OTA 通知",
    direction: "设备订阅",
    topic: "/ota/{product_key}/{device_key}/upgrade/notify"
  },
  {
    name: "OTA 进度/结果",
    direction: "设备发布",
    topic: "/ota/{product_key}/{device_key}/upgrade/progress\n/ota/{product_key}/{device_key}/upgrade/result"
  }
];

const appErrorCodeRows = [
  ["0", "200 / 201", "成功，业务数据在 data"],
  ["400001", "400", "参数错误：手机号/密码/别名/绑定码格式不合法，绑定码不存在（含已轮换旧码），JSON 体不合法"],
  ["401001", "401", "未登录、令牌缺失/过期/无效、refresh_token 已吊销、账号或密码错误"],
  ["403001", "403", "账号禁用、设备禁用、未绑定该设备就访问其子资源"],
  ["404001", "404", "设备或命令不存在（含曾绑定但已解绑）"],
  ["409001", "409", "手机号已注册"],
  ["429001", "429", "请求过于频繁（限流见下方限流表）"],
  ["500001", "500", "服务器内部错误（message 固定，细节看服务端日志）"]
];

const appDeviceFieldRows = [
  ["device_id", "string", "设备 ID，所有子资源路径用它（不是 device_key）"],
  ["alias", "string | null", "当前用户起的别名，null = 未设置（展示回退 name）"],
  ["name", "string", "控制台侧设备名称"],
  ["product_id", "string", "产品 ID"],
  ["product_name", "string", "产品名称"],
  ["product_key", "string", "产品标识（pk_ 前缀）"],
  ["device_key", "string", "设备标识（dk_ 前缀）"],
  ["status", "active | disabled", "设备启用状态"],
  ["online_status", "online | offline | unknown", "实时在线状态"],
  ["firmware_version", "string | null", "固件版本（OTA 成功后更新）"],
  ["bound_at", "string (ISO 8601)", "本次绑定时间"],
  ["shadow_reported", "object", "最近上报的属性全集快照，{} = 尚无上报"],
  ["shadow_updated_at", "string | null", "影子最后更新时间"]
];

export default function IntegrationDocsPage() {
  const items = navItems.map((item) => ({
    ...item,
    active: false
  }));

  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <ConsoleSidebar items={items} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-950">
                  接入文档
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  设备（MQTT）与手机 APP 的接入：认证、Topic、报文格式、绑定、控制、状态与 OTA。
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <SummaryCard
                icon={<KeyRound className="h-5 w-5" />}
                title="设备接入凭据"
                text="设备使用产品标识（Product Key）、设备标识（Device Key）和设备密钥（Device Secret）认证。设备密钥只在创建设备或重置密钥后显示一次。"
              />
              <SummaryCard
                icon={<RadioTower className="h-5 w-5" />}
                title="MQTT 设备接入"
                text="设备通过 EMQX Broker 长连接接入平台，支持在线状态、实时下发、持续上报和 OTA。"
              />
              <SummaryCard
                icon={<Smartphone className="h-5 w-5" />}
                title="APP 用户体系"
                text="手机 APP 使用独立的 App 用户体系（手机号 + 密码，开放注册），走 Authorization: Bearer 令牌认证，与控制台账号互不通用。"
              />
              <SummaryCard
                icon={<BookOpen className="h-5 w-5" />}
                title="扫码绑定"
                text="每台设备一个永久绑定码，二维码可印刷到产品上，用户收到设备扫码即绑；同一张码全家可扫。码泄露时可在控制台重新生成（旧码作废）。设备密钥不出现在二维码上。"
              />
            </div>

            <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-950">
                  整体架构
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  三方两个通道：设备走 MQTT 长连接，APP 走 HTTP + SSE，互不直连。
                </p>
              </div>
              <div className="p-5">
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
{`┌──────────┐  MQTT 1883(明文)/8883(TLS)  ┌────────────┐  HTTPS + Bearer + SSE  ┌──────────┐
│   设备    │ ◄─────────────────────────► │  ziot 平台  │ ◄────────────────────► │  手机APP  │
│ 固件/模组 │      EMQX Broker 长连接      │  (Next.js)  │   注册/绑定/控制/事件流  │          │
└──────────┘                             └─────┬──────┘                        └──────────┘
      ▲ 上报属性/事件/日志,OTA 进度               │ Prisma
      ▼ 收属性设置/服务调用/OTA 通知        PostgreSQL / Redis
                          ▲ 控制台(浏览器, Cookie 会话)：产品/设备/固件/OTA 任务管理、
                            设备记录时间线、日志中心`}
                </pre>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  APP 永远不直连 MQTT Broker，也不接触设备密钥；所有控制指令由平台校验绑定关系后代发。设备是否真正执行由属性上报（影子）闭环，命令状态只代表投递结果。
                </p>
              </div>
            </section>

            <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-950">
                  设备接入前准备
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  先在控制台创建产品和设备，再把设备凭据写入固件或设备配置。
                </p>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-4">
                {[
                  "创建产品，确认产品标识（Product Key）。",
                  "在产品下创建设备，记录设备标识（Device Key）和设备密钥（Device Secret）。",
                  "设备通过 MQTT 连接平台 Broker。",
                  "运行 demo 验证属性上报、控制下发和 OTA 流程。"
                ].map((step, index) => (
                  <div
                    className="rounded-md border border-slate-200 bg-slate-50 p-4"
                    key={step}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <div className="mt-3 text-sm font-medium text-slate-800">
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                  <RadioTower className="h-5 w-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-950">
                    MQTT 设备接入流程
                  </h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  连接、Topic 约定、各类报文格式与 OTA。平台按 Topic 收发，报文均为 JSON。
                </p>
              </div>
              <div className="space-y-6 p-5">
                <DocBlock title="1. 连接参数">
                  <KeyValueTable
                    rows={[
                      ["Broker", "www.ziot.asia:1883（明文）；www.ziot.asia:8883（TLS，Let's Encrypt 证书）"],
                      ["Client ID", "推荐使用 device_key，或使用包含 device_key 的唯一客户端 ID"],
                      ["Username", "{product_key}:{device_key}"],
                      ["Password", "device_secret"],
                      ["Keepalive", "建议 30-60 秒；断线用指数退避自动重连"],
                      ["QoS", "上报与下行建议 QoS 1（至少一次）"],
                      ["认证失败", "username/password 不匹配或设备被禁用会被拒绝（Not authorized）"],
                      ["ACL", "设备只能发布/订阅自己 device_key 的 Topic"]
                    ]}
                  />
                </DocBlock>
                <DocBlock title="2. 在线状态">
                  <p className="text-sm leading-6 text-slate-600">
                    在线/离线由 Broker 的连接事件自动维护，设备<b>无需</b>额外上报上下线消息。连接成功即在线，断开（含心跳超时踢出）即离线；每次属性上报也会刷新最后心跳时间。上下线翻转会在控制台「设备记录」时间线和 APP 事件流中出现。
                  </p>
                </DocBlock>
                <DocBlock title="3. Topic 一览">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                        <tr>
                          <th className="px-4 py-3">功能</th>
                          <th className="px-4 py-3">方向</th>
                          <th className="px-4 py-3">Topic</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {mqttTopics.map((item) => (
                          <tr key={item.name}>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {item.name}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {item.direction}
                            </td>
                            <td className="px-4 py-3">
                              <pre className="whitespace-pre-wrap font-mono text-xs text-slate-700">
                                {item.topic}
                              </pre>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DocBlock>
                <DocBlock title="4. 属性 / 事件 / 日志上报">
                  <CodeBlock
                    value={`# 属性上报：params 合并进设备影子 reported（APP/控制台实时可见）
/sys/{pk}/{dk}/thing/property/post
{
  "id": "report_1",
  "params": { "temperature": 23.6, "humidity": 58 }
}

# 事件上报：自定义结构，平台原样存档展示
/sys/{pk}/{dk}/thing/event/post
{ "id": "evt_1", "params": { "code": "door_open", "value": 1 } }

# 日志上报：level 可选 debug/info/warn/error，默认 info
/sys/{pk}/{dk}/thing/log/post
{ "id": "log_1", "level": "warn", "message": "voltage low" }`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    三类上报都写入设备记录时间线；属性上报额外合并影子并递增 version。
                  </p>
                </DocBlock>
                <DocBlock title="5. 属性设置下发（property/set）">
                  <CodeBlock
                    value={`# 订阅 /sys/{pk}/{dk}/thing/property/set，收到：
{
  "id": "cmd_xxx",
  "request_id": "cmd_xxx",
  "params": { "temperature": 22 }
}

# ① 应用参数后，把新值按第 4 节格式 post 回属性上报 Topic
#    （影子 reported 收敛，APP/控制台才能看到实际生效值）
# ② 可选应答（平台不强制，命令状态不依赖它）：
/sys/{pk}/{dk}/thing/property/set_reply
{ "id": "cmd_xxx", "request_id": "cmd_xxx", "code": 0, "data": {} }`}
                  />
                </DocBlock>
                <DocBlock title="6. 服务调用（service/invoke）">
                  <CodeBlock
                    value={`# 订阅 /sys/{pk}/{dk}/thing/service/+/invoke，收到（identifier 在 Topic 里）：
{
  "id": "cmd_xxx",
  "request_id": "cmd_xxx",
  "params": { "delay": 1 }
}

# 可选回复（code=0 成功；作为透传数据给需要执行确认的业务消费）：
/sys/{pk}/{dk}/thing/service/reboot/reply
{ "id": "cmd_xxx", "request_id": "cmd_xxx", "code": 0, "data": { "ok": true } }`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    命令状态为<b>投递语义</b>：平台发布到 Broker 成功即 success、发布失败即 failed，不等设备应答。服务标识（identifier）与 params 结构由产品固件定义，APP / 控制台下发时需与设备侧约定一致。
                  </p>
                </DocBlock>
                <DocBlock title="7. OTA 升级流程">
                  <CodeBlock
                    value={`# ① 订阅 /ota/{pk}/{dk}/upgrade/notify，收到升级通知：
{
  "task_id": "ota_xxx",
  "firmware": {
    "version": "v1.0.1",
    "file_url": "https://www.ziot.asia/uploads/firmwares/.../fw.bin",
    "file_size": 204800,
    "sha256": "0000...64位十六进制"
  }
}

# ② 用 HTTP GET 下载 file_url（大文件可 Range 断点续传），
#    校验 sha256 与 file_size 一致后写入固件分区

# ③ 上报进度（status: downloading / installing，progress 0-100）
/ota/{pk}/{dk}/upgrade/progress
{ "task_id": "ota_xxx", "status": "downloading", "progress": 30 }
{ "task_id": "ota_xxx", "status": "installing",  "progress": 80 }

# ④ 上报结果（code=0 成功，非 0 失败；成功可带新固件版本号）
/ota/{pk}/{dk}/upgrade/result
{ "task_id": "ota_xxx", "code": 0, "progress": 100, "firmware_version": "v1.0.1" }`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    file_url 的来源由固件管理方式决定：控制台上传的固件由平台 Web 服务器直接提供（无鉴权 GET，单文件 ≤ 5MB）；也可在创建固件时登记任意外部 URL（自建文件服务器 / CDN）。设备只需认 HTTP GET + sha256 校验，下载不经 MQTT。
                  </p>
                </DocBlock>
                <DocBlock title="8. Demo 验证">
                  <CodeBlock
                    value={`python3 -m pip install paho-mqtt
MQTT_HOST=www.ziot.asia MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/mqtt-python-demo.py

PAHO_EMBEDDED_C_DIR=/tmp/paho.mqtt.embedded-c
gcc docs/device-integration/mqtt-c-demo.c \\
  -I"$PAHO_EMBEDDED_C_DIR/MQTTPacket/src" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTConnectClient.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTSubscribeClient.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTSerializePublish.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTDeserializePublish.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTPacket.c" \\
  -o /tmp/ziot-mqtt-c-demo
MQTT_HOST=www.ziot.asia MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 /tmp/ziot-mqtt-c-demo`}
                  />
                </DocBlock>
              </div>
            </section>

            <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-950">
                    APP 接入流程
                  </h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  注册独立账号 → 扫码绑定 → SSE/影子读状态 → 控制下发 → 别名/解绑。全部接口走 HTTPS + Bearer。
                </p>
              </div>
              <div className="space-y-6 p-5">
                <DocBlock title="1. 统一响应包络与错误码">
                  <p className="mb-2 text-sm text-slate-600">
                    所有 /api/v1/app/** 接口返回统一包络（SSE 流除外）；HTTP 状态码与 code 一一对应。
                  </p>
                  <CodeBlock
                    value={`# 成功
{ "code": 0, "message": "ok", "request_id": "req_xxx", "data": { ...业务数据 } }
# 失败（data 恒为 null，message 为中文可直连展示）
{ "code": 401001, "message": "缺少访问令牌", "request_id": "req_xxx", "data": null }`}
                  />
                  <div className="mt-3">
                    <DataTable
                      columns={["code", "HTTP", "场景"]}
                      rows={appErrorCodeRows}
                    />
                  </div>
                </DocBlock>
                <DocBlock title="2. 认证（独立 App 用户体系）">
                  <KeyValueTable
                    rows={[
                      ["注册（开放，无需邀请码）", "POST /api/v1/app/auth/register"],
                      ["登录", "POST /api/v1/app/auth/login"],
                      ["刷新令牌（旋转式）", "POST /api/v1/app/auth/refresh"],
                      ["修改密码", "POST /api/v1/app/auth/change-password"],
                      ["登出", "POST /api/v1/app/auth/logout"],
                      ["当前用户", "GET /api/v1/app/me"],
                      ["认证方式", "Authorization: Bearer <access_token>"],
                      ["令牌有效期", "access_token 15 分钟；refresh_token 30 天（art_ 前缀）"]
                    ]}
                  />
                  <CodeBlock
                    value={`# 注册/登录/刷新/改密的响应 data 结构相同（均为一对新令牌 + user）：
{
  "user": { "id": "app_xxx", "phone": "13912345678", "nickname": "小明",
            "status": "active", "created_at": "..." },
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "art_xxx",
  "access_token_expires_at": "...T08:15:00.000Z",
  "refresh_token_expires_at": "...T08:00:00.000Z"
}

curl -s -X POST http://localhost:3000/api/v1/app/auth/register \\
  -H 'content-type: application/json' \\
  -d '{"phone":"13912345678","password":"Pass1234","nickname":"小明"}'

# 登录 body：{ "phone": "...", "password": "..." }
# 刷新 body：{ "refresh_token": "art_xxx" }  ← 旋转式：旧 refresh_token 用一次即作废，
#                                          必须原子替换存储；返回 401001 则引导重新登录
# 改密 body：{ "old_password": "...", "new_password": "..." }（Bearer）
#   → 吊销全部刷新令牌（其它设备全部登出），响应返回新令牌对，当前设备无感续用`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    令牌在响应体返回（不下发 Cookie），APP 自行安全存储（建议 Keychain/Keystore），不进 URL、不进日志。
                  </p>
                </DocBlock>
                <DocBlock title="3. 扫码绑定">
                  <p className="text-sm text-slate-600">
                    在设备列表行点「二维码」按钮查看设备的永久绑定码（首次查看自动生成），二维码可印刷到产品上。二维码内容是一个 URL，绑定码在 # 之后（URL fragment，不经过任何服务器），APP 本地解析即可：
                  </p>
                  <CodeBlock
                    value={`https://www.ziot.asia/b/#BD7K2M9XQ4ABCDEFGH
└─────── APP 可达域名 ──────┘└└─── 绑定码(永久) ───┘

# APP 解析出绑定码后调用（支持手动输码，自动转大写）
curl -s -X POST http://localhost:3000/api/v1/app/devices/bind \\
  -H 'content-type: application/json' \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{"code":"BD7K2M9XQ4ABCDEFGH"}'
# 响应 data 为设备对象（字段见下表），可直接进入设备首页`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    绑定码永不过期，同一张码可被多个 App 用户扫描绑定（家庭共享）；码泄露时在控制台重新生成，旧码立即失效。解绑后再扫同一张码可重新绑定。
                  </p>
                </DocBlock>
                <DocBlock title="4. 设备对象（Device）字段">
                  <p className="mb-2 text-sm text-slate-600">
                    bind 响应、设备列表项、改别名响应均为同一结构：
                  </p>
                  <DataTable
                    columns={["字段", "类型", "说明"]}
                    rows={appDeviceFieldRows}
                  />
                </DocBlock>
                <DocBlock title="5. 设备列表与状态">
                  <CodeBlock
                    value={`# 我的设备（含在线状态和属性快照）
curl -s http://localhost:3000/api/v1/app/devices -H "Authorization: Bearer $ACCESS_TOKEN"
# data: { "items": [ { ...设备对象 }, ... ] }

# 设备影子（reported = 属性全集，version 单调递增可做变更检测）
curl -s http://localhost:3000/api/v1/app/devices/<deviceId>/shadow -H "Authorization: Bearer $ACCESS_TOKEN"
# data: { "device_id", "reported": {...}, "desired": {...}, "version", "updated_at" }`}
                  />
                </DocBlock>
                <DocBlock title="6. 实时事件流（SSE）">
                  <CodeBlock
                    value={`# 长连接，只推当前用户绑定的设备；连接建立时校验一次 Bearer
curl -N http://localhost:3000/api/v1/app/events/stream -H "Authorization: Bearer $ACCESS_TOKEN"

event: ready
data: {"device_ids":["dev_xxx"]}

event: device.shadow.updated
data: {"type":"device.shadow.updated","device_id":"dev_xxx","reported":{"temperature":24.5},"version":12,"updated_at":"..."}

event: device.status.changed
data: {"type":"device.status.changed","device_id":"dev_xxx","online_status":"online","occurred_at":"..."}

event: heartbeat
data: {"now":"..."}    ← 每 20 秒一次保活`}
                  />
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    前台推荐 SSE 实时刷新；<b>无历史重放</b>，断线重连后先拉一次设备列表 + shadow 对齐再继续收流；轮询 3-10s 作为兜底。浏览器原生 EventSource 不能带 Authorization 头，需用 fetch 流式读取或支持自定义 header 的 SSE 库（event-source-polyfill、OkHttp 等）。
                  </p>
                </DocBlock>
                <DocBlock title="7. 控制设备">
                  <CodeBlock
                    value={`# 同步控制（推荐：投递完成即返回终态命令对象，通常几十毫秒）
curl -s -X POST http://localhost:3000/api/v1/app/devices/<deviceId>/commands:sync \\
  -H 'content-type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{"kind":"service","identifier":"reboot","params":{}}'

# 属性设置（kind=property_set 不需要 identifier）
curl -s -X POST http://localhost:3000/api/v1/app/devices/<deviceId>/commands:sync \\
  -H 'content-type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{"kind":"property_set","params":{"power":true}}'

# 查询命令详情
curl -s http://localhost:3000/api/v1/app/commands/<commandId> -H "Authorization: Bearer $ACCESS_TOKEN"`}
                  />
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    命令状态为<b>投递语义</b>：pending → success / failed，success 表示平台已成功发布到 Broker，不代表设备已执行——确认执行看 SSE 推送或影子 reported 是否收敛到设置值。identifier 与 params 的取值由产品固件定义（见上方 MQTT 第 5/6 节），需与设备侧约定对齐。
                  </p>
                </DocBlock>
                <DocBlock title="8. 别名与解绑">
                  <CodeBlock
                    value={`# 改别名（1-128 位，空串清除；响应为更新后的设备对象）
curl -s -X PATCH http://localhost:3000/api/v1/app/devices/<deviceId> \\
  -H 'content-type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{"alias":"客厅的空调"}'

# 解绑（软删除，仅影响自己，不影响其他家庭成员；再扫同一张码可重新绑定）
curl -s -X DELETE http://localhost:3000/api/v1/app/devices/<deviceId> \\
  -H "Authorization: Bearer $ACCESS_TOKEN"
# 响应 data: { "device_id": "...", "org_id": "...", "unbound_at": "..." }
# 解绑后访问该设备子资源返回 403001`}
                  />
                </DocBlock>
                <DocBlock title="9. 限流与安全">
                  <KeyValueTable
                    rows={[
                      ["注册", "5 次/分钟/IP"],
                      ["登录", "10 次/分钟/IP"],
                      ["绑定", "20 次/分钟/用户"],
                      ["超限", "429001，APP 端退避重试"],
                      ["传输", "生产环境全站 HTTPS；设备密钥永不出现在任何 App API 响应中"]
                    ]}
                  />
                </DocBlock>
                <DocBlock title="10. 完整文档">
                  <KeyValueTable
                    rows={[
                      ["APP 接入指南（令牌管理、二维码解析、SSE 与轮询实践）", "docs/app-integration/integration-guide.md"],
                      ["App 端 API 字段级参考（统一包络、错误码表、设备对象类型定义）", "docs/api/app-api.md"],
                      ["设备接入指南与 MQTT demo（Python/C）", "docs/device-integration/integration-guide.md"]
                    ]}
                  />
                </DocBlock>
              </div>
            </section>

            <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <BookOpen className="mt-0.5 h-5 w-5 text-slate-600" />
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    调试位置
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    MQTT 连接状态在设备列表和设备详情页显示；命令下发与设备上报（含上下线事件）在设备详情页和控制台的「设备记录」统一时间线查看，日志明细在日志中心；OTA 进度在 OTA 任务详情页查看。设备二维码（App 扫码绑定）在设备列表行的「二维码」按钮弹窗查看与重新生成，已绑定的 App 用户（手机号脱敏）也在该弹窗查看。
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  icon,
  title,
  text
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
        {icon}
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function DocBlock({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-950">{title}</h3>
      {children}
    </div>
  );
}

function KeyValueTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map(([key, value]) => (
            <tr key={key}>
              <td className="w-56 bg-slate-50 px-4 py-3 font-mono text-xs font-medium text-slate-700">
                {key}
              </td>
              <td className="px-4 py-3 text-slate-600">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataTable({
  columns,
  rows
}: {
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            {columns.map((column) => (
              <th className="px-4 py-3" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td
                  className={
                    index === 0
                      ? "px-4 py-3 font-mono text-xs font-medium text-slate-700"
                      : "px-4 py-3 text-slate-600"
                  }
                  key={index}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
      {value}
    </pre>
  );
}

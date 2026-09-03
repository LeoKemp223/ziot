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
    name: "服务调用下发",
    direction: "设备订阅",
    topic: "/sys/{product_key}/{device_key}/thing/service/+/invoke"
  },
  {
    name: "服务调用回复",
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
                  设备（MQTT）与手机 APP 的接入流程：认证、绑定、控制和状态。
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
                  MQTT 设备连接 Broker 后保持在线，平台通过 Topic 接收上报并下发控制命令。
                </p>
              </div>
              <div className="space-y-6 p-5">
                <DocBlock title="1. 连接参数">
                  <KeyValueTable
                    rows={[
                      ["Broker", "www.ziot.asia:1883（明文）；www.ziot.asia:8883（TLS，Let's Encrypt 证书）"],
                      ["Client ID", "推荐使用 device_key，或使用包含 device_key 的唯一客户端 ID"],
                      ["Username", "{product_key}:{device_key}"],
                      ["Password", "device_secret"]
                    ]}
                  />
                </DocBlock>
                <DocBlock title="2. 订阅和发布 Topic">
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
                <DocBlock title="3. 属性上报格式">
                  <CodeBlock
                    value={`{
  "id": "report_1",
  "params": {
    "temperature": 23.6,
    "humidity": 58
  }
}`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    属性上报会写入设备日志，并同步更新设备影子的 reported。
                  </p>
                </DocBlock>
                <DocBlock title="4. 控制下发和回执">
                  <p className="text-sm text-slate-600">
                    设备订阅服务调用 Topic。收到平台下发后，按服务标识发布 reply Topic，平台会把命令记录更新为成功或失败。
                  </p>
                  <CodeBlock
                    value={`// 订阅
/sys/pk_demo/dk_mqtt_demo/thing/service/+/invoke

// 回复
/sys/pk_demo/dk_mqtt_demo/thing/service/setSwitch/reply

{
  "id": "cmd_xxx",
  "code": 0,
  "data": {
    "ok": true
  }
}`}
                  />
                </DocBlock>
                <DocBlock title="5. Demo 验证">
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
                  手机 APP 注册独立账号，扫描设备绑定码后即可控制和读取设备状态。
                </p>
              </div>
              <div className="space-y-6 p-5">
                <DocBlock title="1. 认证（独立 App 用户体系）">
                  <KeyValueTable
                    rows={[
                      ["注册（开放，无需邀请码）", "POST /api/v1/app/auth/register"],
                      ["登录", "POST /api/v1/app/auth/login"],
                      ["刷新令牌（旋转式）", "POST /api/v1/app/auth/refresh"],
                      ["认证方式", "Authorization: Bearer <access_token>"],
                      ["令牌有效期", "access_token 15 分钟；refresh_token 30 天"]
                    ]}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    令牌在响应体返回（不下发 Cookie），APP 自行安全存储；请求返回 401001 时用 refresh_token 换新令牌重放。
                  </p>
                  <CodeBlock
                    value={`curl -s -X POST http://localhost:3000/api/v1/app/auth/register \\
  -H 'content-type: application/json' \\
  -d '{"phone":"13912345678","password":"Pass1234","nickname":"小明"}'

# 响应 data: { access_token, refresh_token, user, ... }`}
                  />
                </DocBlock>
                <DocBlock title="2. 扫码绑定">
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
  -d '{"code":"BD7K2M9XQ4ABCDEFGH"}'`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    绑定码永不过期，同一张码可被多个 App 用户扫描绑定（家庭共享）；码泄露时在控制台重新生成，旧码立即失效。
                  </p>
                </DocBlock>
                <DocBlock title="3. 设备列表与状态">
                  <CodeBlock
                    value={`# 我的设备（含在线状态 online/offline 和最近上报的属性快照）
curl -s http://localhost:3000/api/v1/app/devices -H "Authorization: Bearer $ACCESS_TOKEN"

# 设备影子（reported = 设备当前上报的属性全集）
curl -s http://localhost:3000/api/v1/app/devices/<deviceId>/shadow -H "Authorization: Bearer $ACCESS_TOKEN"

# 实时事件流（SSE 长连接，只推当前用户绑定的设备）
#   device.shadow.updated = 属性上报合并进影子；device.status.changed = 上下线翻转
curl -N http://localhost:3000/api/v1/app/events/stream -H "Authorization: Bearer $ACCESS_TOKEN"`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    前台推荐 SSE 实时刷新（断线重连后先拉一次列表和 shadow 对齐），轮询 3-10s 作为兜底。浏览器原生 EventSource 不能带 Authorization 头，需用 fetch 流式或支持自定义 header 的 SSE 库。
                  </p>
                </DocBlock>
                <DocBlock title="4. 控制设备">
                  <CodeBlock
                    value={`# 同步控制（推荐：投递完成即返回终态命令对象，通常几十毫秒）
curl -s -X POST http://localhost:3000/api/v1/app/devices/<deviceId>/commands:sync \\
  -H 'content-type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{"kind":"service","identifier":"reboot","params":{}}'

# 属性设置（kind=property_set 不需要 identifier）
curl -s -X POST http://localhost:3000/api/v1/app/devices/<deviceId>/commands:sync \\
  -H 'content-type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{"kind":"property_set","params":{"power":true}}'`}
                  />
                  <p className="mt-2 text-sm text-slate-600">
                    命令状态为投递语义：pending → success / failed，success 表示平台已成功发布到 Broker，不代表设备已执行——确认执行看 SSE 推送或影子 reported 是否收敛。identifier 与 params 的取值由产品固件定义，需与设备侧约定对齐。
                  </p>
                </DocBlock>
                <DocBlock title="5. 别名与解绑">
                  <CodeBlock
                    value={`# 改别名（1-128 位，空串清除；响应为更新后的设备对象）
curl -s -X PATCH http://localhost:3000/api/v1/app/devices/<deviceId> \\
  -H 'content-type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{"alias":"客厅的空调"}'

# 解绑（软删除，仅影响自己；再扫同一张码可重新绑定）
curl -s -X DELETE http://localhost:3000/api/v1/app/devices/<deviceId> \\
  -H "Authorization: Bearer $ACCESS_TOKEN"
# 响应 data: { device_id, org_id, unbound_at }`}
                  />
                </DocBlock>
                <DocBlock title="6. 完整文档">
                  <KeyValueTable
                    rows={[
                      ["APP 接入指南（令牌管理、二维码解析、SSE 与轮询实践）", "docs/app-integration/integration-guide.md"],
                      ["App 端 API 字段级参考（统一包络、错误码表、设备对象类型定义）", "docs/api/app-api.md"]
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

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
      {value}
    </pre>
  );
}

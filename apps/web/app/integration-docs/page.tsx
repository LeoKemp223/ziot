import { BookOpen, KeyRound, RadioTower } from "lucide-react";
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
                  设备接入文档
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  MQTT 设备的认证、上报、控制和 OTA 接入流程。
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <SummaryCard
                icon={<KeyRound className="h-5 w-5" />}
                title="接入凭据"
                text="设备使用产品标识（Product Key）、设备标识（Device Key）和设备密钥（Device Secret）认证。设备密钥只在创建设备或重置密钥后显示一次。"
              />
              <SummaryCard
                icon={<RadioTower className="h-5 w-5" />}
                title="MQTT 接入"
                text="设备通过 EMQX Broker 长连接接入平台，支持在线状态、实时下发、持续上报和 OTA。"
              />
            </div>

            <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-950">
                  接入前准备
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
                      ["Broker", "localhost:1883，生产环境替换为实际 MQTT 域名或 IP"],
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
MQTT_HOST=localhost MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/mqtt-python-demo.py

PAHO_EMBEDDED_C_DIR=/tmp/paho.mqtt.embedded-c
gcc docs/device-integration/mqtt-c-demo.c \\
  -I"$PAHO_EMBEDDED_C_DIR/MQTTPacket/src" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTConnectClient.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTSubscribeClient.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTSerializePublish.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTDeserializePublish.c" \\
  "$PAHO_EMBEDDED_C_DIR/MQTTPacket/src/MQTTPacket.c" \\
  -o /tmp/ziot-mqtt-c-demo
MQTT_HOST=localhost MQTT_PORT=1883 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 /tmp/ziot-mqtt-c-demo`}
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
                    MQTT 连接状态在设备列表和设备详情页显示；属性、事件、日志上报在设备详情页的上报记录和日志中心查看；控制下发结果在设备详情页或控制台的命令记录查看；OTA 进度在 OTA 任务详情页查看。
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

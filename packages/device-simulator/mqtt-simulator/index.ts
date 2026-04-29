import mqtt from "mqtt";
import { buildServiceInvokeTopic } from "@ziot/domain";

const brokerUrl = process.env.MQTT_BROKER_URL ?? "mqtt://localhost:1883";
const productKey = process.env.PRODUCT_KEY ?? "pk_demo";
const deviceKey = process.env.DEVICE_KEY ?? "dk_mqtt_demo";
const deviceSecret = process.env.DEVICE_SECRET ?? "DeviceSecret123";
const username = `${productKey}:${deviceKey}`;
const password = deviceSecret;

const client = mqtt.connect(brokerUrl, {
  clientId: process.env.MQTT_CLIENT_ID ?? deviceKey,
  username,
  password,
  clean: true,
  reconnectPeriod: 0
});

const commandTopic = buildServiceInvokeTopic(productKey, deviceKey, "+");
const propertyTopic = `/sys/${productKey}/${deviceKey}/thing/property/post`;
const otaNotifyTopic = `/ota/${productKey}/${deviceKey}/upgrade/notify`;
const otaProgressTopic = `/ota/${productKey}/${deviceKey}/upgrade/progress`;
const otaResultTopic = `/ota/${productKey}/${deviceKey}/upgrade/result`;

client.on("connect", () => {
  console.log(`connected ${username}`);
  client.subscribe([commandTopic, otaNotifyTopic], { qos: 1 }, (error) => {
    if (error) {
      console.error(error);
      client.end(true);
      return;
    }

    client.publish(
      propertyTopic,
      JSON.stringify({
        id: `${Date.now()}`,
        params: {
          temperature: 23.6,
          humidity: 58
        }
      }),
      { qos: 1 }
    );
  });
});

client.on("message", (topic, payload) => {
  console.log(`downlink ${topic} ${payload.toString()}`);

  if (topic === otaNotifyTopic) {
    let taskId = "";

    try {
      const body = JSON.parse(payload.toString()) as { task_id?: string };
      taskId = body.task_id ?? "";
    } catch {
      taskId = "";
    }

    if (!taskId) {
      return;
    }

    for (const [status, progress] of [
      ["downloading", 30],
      ["installing", 80]
    ] as const) {
      client.publish(
        otaProgressTopic,
        JSON.stringify({
          task_id: taskId,
          status,
          progress
        }),
        { qos: 1 }
      );
    }

    client.publish(
      otaResultTopic,
      JSON.stringify({
        task_id: taskId,
        code: 0,
        progress: 100,
        firmware_version: "simulated"
      }),
      { qos: 1 }
    );
    return;
  }

  const parts = topic.split("/").filter(Boolean);
  const identifier = parts[5] ?? "unknown";
  const replyTopic = `/sys/${productKey}/${deviceKey}/thing/service/${identifier}/reply`;

  client.publish(
    replyTopic,
    JSON.stringify({
      id: `${Date.now()}`,
      code: 0,
      data: {}
    }),
    { qos: 1 }
  );
});

client.on("error", (error) => {
  console.error(error);
  client.end(true);
});

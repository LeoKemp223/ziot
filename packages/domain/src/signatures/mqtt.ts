import { createHmac } from "node:crypto";

export type MqttUsername = {
  productKey: string;
  deviceKey: string;
};

export function parseMqttUsername(username: string): MqttUsername | null {
  const [productKey, deviceKey, extra] = username.split(":");

  if (!productKey || !deviceKey || extra !== undefined) {
    return null;
  }

  return { productKey, deviceKey };
}

export function verifyMqttPassword(
  deviceSecret: string,
  username: string,
  password: string
): boolean {
  return parseMqttUsername(username) !== null && deviceSecret === password;
}

// 旧版设备曾把 MQTT 密码存为 HMAC(secret, username) 后再 bcrypt,
// 登录兼容路径需要同一算法比对
export function signHmacSha256(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

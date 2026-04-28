import { signHmacSha256 } from "./http";

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
  return signHmacSha256(deviceSecret, username) === password.toLowerCase();
}

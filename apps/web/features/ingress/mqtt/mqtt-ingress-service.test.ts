import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { signHmacSha256 } from "@ziot/domain";
import {
  authenticateMqttClient,
  authorizeMqttAction,
  recordMqttReport,
  recordMqttWebhookEvent
} from "./mqtt-ingress-service";

const now = new Date("2026-04-29T01:00:00.000Z");

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: "dev_demo",
    org_id: "org_default",
    product_id: "prd_demo",
    device_key: "dk_demo",
    device_secret_hash: "",
    status: "active",
    product: {
      id: "prd_demo",
      product_key: "pk_demo"
    },
    ...overrides
  };
}

async function hashedDeviceSecret(secret = "DeviceSecret123") {
  return bcrypt.hash(secret, 10);
}

async function hashedLegacyMqttPassword(secret = "DeviceSecret123") {
  return bcrypt.hash(signHmacSha256(secret, "pk_demo:dk_demo"), 10);
}

describe("mqtt ingress service", () => {
  it("allows valid mqtt credentials", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(
          device({
            device_secret_hash: await hashedDeviceSecret()
          })
        )
      }
    };

    const result = await authenticateMqttClient(db, {
      username: "pk_demo:dk_demo",
      password: "DeviceSecret123"
    });

    expect(result).toEqual({ result: "allow" });
  });

  it("allows direct device_secret against legacy HMAC hashes", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(
          device({
            device_secret_hash: await hashedLegacyMqttPassword()
          })
        )
      }
    };

    const result = await authenticateMqttClient(db, {
      username: "pk_demo:dk_demo",
      password: "DeviceSecret123"
    });

    expect(result).toEqual({ result: "allow" });
  });

  it("denies invalid secret and disabled devices", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(
          device({
            device_secret_hash: await hashedDeviceSecret(),
            status: "disabled"
          })
        )
      }
    };

    await expect(
      authenticateMqttClient(db, {
        username: "pk_demo:dk_demo",
        password: "wrong"
      })
    ).resolves.toMatchObject({ result: "deny" });
  });

  it("allows publishing only to the device's own report topics", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      }
    };

    await expect(
      authorizeMqttAction(db, {
        username: "pk_demo:dk_demo",
        action: "publish",
        topic: "/sys/pk_demo/dk_demo/thing/property/post"
      })
    ).resolves.toEqual({ result: "allow" });

    await expect(
      authorizeMqttAction(db, {
        username: "pk_demo:dk_demo",
        action: "publish",
        topic: "/sys/pk_demo/dk_other/thing/property/post"
      })
    ).resolves.toMatchObject({ result: "deny" });
  });

  it("allows subscribing only to own command topics", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device())
      }
    };

    await expect(
      authorizeMqttAction(db, {
        username: "pk_demo:dk_demo",
        action: "subscribe",
        topic: "/sys/pk_demo/dk_demo/thing/property/set"
      })
    ).resolves.toEqual({ result: "allow" });

    await expect(
      authorizeMqttAction(db, {
        username: "pk_demo:dk_demo",
        action: "subscribe",
        topic: "/sys/pk_demo/dk_demo/thing/service/+/invoke"
      })
    ).resolves.toEqual({ result: "allow" });

    await expect(
      authorizeMqttAction(db, {
        username: "pk_demo:dk_demo",
        action: "subscribe",
        topic: "/sys/pk_demo/+/thing/service/+/invoke"
      })
    ).resolves.toMatchObject({ result: "deny" });
  });

  it("updates online status and writes lifecycle logs from webhooks", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device()),
        update: vi.fn().mockResolvedValue({})
      },
      deviceLog: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const result = await recordMqttWebhookEvent(db, {
      event: "client.connected",
      username: "pk_demo:dk_demo",
      clientId: "client-1",
      connectedAt: now
    });

    expect(result).toEqual({ result: "allow" });
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "dev_demo" },
      data: {
        online_status: "online",
        last_online_at: now,
        last_heartbeat_at: now
      }
    });
    expect(db.deviceLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        org_id: "org_default",
        product_id: "prd_demo",
        device_id: "dev_demo",
        type: "lifecycle",
        content: {
          event: "client.connected",
          client_id: "client-1"
        }
      })
    });
  });

  it("records property reports and updates reported shadow", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device()),
        update: vi.fn().mockResolvedValue({})
      },
      deviceShadow: {
        findUnique: vi.fn().mockResolvedValue({
          device_id: "dev_demo",
          reported: { humidity: 50 },
          desired: {},
          version: BigInt(1)
        }),
        update: vi.fn().mockResolvedValue({})
      },
      deviceLog: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const result = await recordMqttReport(db, {
      topic: "/sys/pk_demo/dk_demo/thing/property/post",
      payload: {
        id: "report_1",
        params: {
          temperature: 23.6,
          humidity: 58
        }
      }
    });

    expect(result).toEqual({ result: "allow" });
    expect(db.deviceShadow.update).toHaveBeenCalledWith({
      where: { device_id: "dev_demo" },
      data: {
        reported: {
          humidity: 58,
          temperature: 23.6
        },
        version: { increment: 1 }
      }
    });
    expect(db.deviceLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        org_id: "org_default",
        product_id: "prd_demo",
        device_id: "dev_demo",
        type: "property",
        level: "info",
        content: {
          topic: "/sys/pk_demo/dk_demo/thing/property/post",
          payload: {
            id: "report_1",
            params: {
              temperature: 23.6,
              humidity: 58
            }
          }
        }
      })
    });
  });
});

import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  createHttpCanonicalString,
  sha256Hex,
  signHmacSha256
} from "@ziot/domain";
import {
  authenticateHttpDevice,
  listPendingHttpDeviceCommands,
  recordHttpDeviceCommandReply,
  recordHttpDeviceReport,
  type HttpDeviceContext,
  type NonceStore
} from "./http-device-service";

const now = new Date("2026-04-29T08:00:00.000Z");
const secret = "DeviceSecret123";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prd_demo",
    product_key: "pk_demo",
    ...overrides
  };
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: "dev_demo",
    org_id: "org_default",
    product_id: "prd_demo",
    device_key: "dk_demo",
    device_secret_hash: "",
    status: "active",
    product: product(),
    ...overrides
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmd_demo",
    org_id: "org_default",
    device_id: "dev_demo",
    identifier: "setSwitch",
    params: { power: true },
    status: "sent",
    request_id: "cmd_demo",
    result: null,
    error_code: null,
    error_message: null,
    timeout_at: new Date("2026-04-29T08:01:00.000Z"),
    sent_at: null,
    replied_at: null,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function nonceStore(): NonceStore {
  const seen = new Set<string>();

  return {
    async reserve(key: string) {
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  };
}

function signedHeaders(input: {
  method?: string;
  path?: string;
  body?: string;
  timestamp?: string;
  nonce?: string;
  deviceSecret?: string;
}) {
  const method = input.method ?? "POST";
  const path = input.path ?? "/device-api/v1/properties";
  const body = input.body ?? JSON.stringify({ params: { temperature: 23.6 } });
  const timestamp = input.timestamp ?? String(now.getTime());
  const nonce = input.nonce ?? "nonce_1";
  const deviceSecret = input.deviceSecret ?? secret;
  const bodySha256 = sha256Hex(body);
  const canonical = createHttpCanonicalString({
    method,
    path,
    timestamp,
    nonce,
    bodySha256
  });

  return new Headers({
    "x-ziot-product-key": "pk_demo",
    "x-ziot-device-key": "dk_demo",
    "x-ziot-device-secret": deviceSecret,
    "x-ziot-timestamp": timestamp,
    "x-ziot-nonce": nonce,
    "x-ziot-body-sha256": bodySha256,
    "x-ziot-signature": signHmacSha256(deviceSecret, canonical)
  });
}

async function context(overrides: Record<string, unknown> = {}): Promise<HttpDeviceContext> {
  return {
    device: device({
      device_secret_hash: await bcrypt.hash(secret, 10),
      ...overrides
    }),
    timestamp: String(now.getTime()),
    nonce: "nonce_1"
  };
}

describe("http device service", () => {
  it("authenticates a valid signed HTTP device request", async () => {
    const body = JSON.stringify({ params: { temperature: 23.6 } });
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(
          device({
            device_secret_hash: await bcrypt.hash(secret, 10)
          })
        )
      }
    };

    const result = await authenticateHttpDevice(db, {
      method: "POST",
      path: "/device-api/v1/properties",
      headers: signedHeaders({ body }),
      body,
      now,
      nonceStore: nonceStore()
    });

    expect(result.device.id).toBe("dev_demo");
    expect(db.device.findFirst).toHaveBeenCalledWith({
      where: {
        device_key: "dk_demo",
        deleted_at: null,
        product: {
          product_key: "pk_demo",
          deleted_at: null
        }
      },
      include: { product: true }
    });
  });

  it("rejects invalid signatures, expired timestamps, replayed nonces, and disabled devices", async () => {
    const body = "{}";
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(
          device({
            device_secret_hash: await bcrypt.hash(secret, 10)
          })
        )
      }
    };

    await expect(
      authenticateHttpDevice(db, {
        method: "POST",
        path: "/device-api/v1/properties",
        headers: signedHeaders({ body, deviceSecret: "wrong" }),
        body,
        now,
        nonceStore: nonceStore()
      })
    ).rejects.toMatchObject({ code: 401001 });

    await expect(
      authenticateHttpDevice(db, {
        method: "POST",
        path: "/device-api/v1/properties",
        headers: signedHeaders({ body, timestamp: "1777371600000" }),
        body,
        now,
        nonceStore: nonceStore()
      })
    ).rejects.toMatchObject({
      code: 401001,
      message: "expired timestamp"
    });

    const replayStore = nonceStore();
    const headers = signedHeaders({ body, nonce: "nonce_replay" });

    await authenticateHttpDevice(db, {
      method: "POST",
      path: "/device-api/v1/properties",
      headers,
      body,
      now,
      nonceStore: replayStore
    });
    await expect(
      authenticateHttpDevice(db, {
        method: "POST",
        path: "/device-api/v1/properties",
        headers,
        body,
        now,
        nonceStore: replayStore
      })
    ).rejects.toMatchObject({ code: 409001 });

    db.device.findFirst.mockResolvedValueOnce(
      device({
        status: "disabled",
        device_secret_hash: await bcrypt.hash(secret, 10)
      })
    );
    await expect(
      authenticateHttpDevice(db, {
        method: "POST",
        path: "/device-api/v1/properties",
        headers: signedHeaders({ body, nonce: "nonce_disabled" }),
        body,
        now,
        nonceStore: nonceStore()
      })
    ).rejects.toMatchObject({ code: 403001 });
  });

  it("records property reports and updates reported shadow", async () => {
    const db = {
      device: {
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

    await recordHttpDeviceReport(db, {
      context: await context(),
      type: "property",
      payload: {
        id: "report_1",
        params: {
          temperature: 23.6,
          humidity: 58
        }
      }
    });

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
        type: "property",
        level: "info",
        content: {
          protocol: "http",
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

  it("lists pending commands and marks them delivered", async () => {
    const db = {
      device: {
        update: vi.fn().mockResolvedValue({})
      },
      deviceCommand: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([command()])
      }
    };

    const result = await listPendingHttpDeviceCommands(db, {
      context: await context()
    });

    expect(result).toEqual([
      expect.objectContaining({
        request_id: "cmd_demo",
        identifier: "setSwitch",
        status: "delivered"
      })
    ]);
    expect(db.deviceCommand.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: { in: ["cmd_demo"] },
        status: { in: ["pending", "sent"] }
      },
      data: {
        status: "delivered",
        sent_at: expect.any(Date)
      }
    });
  });

  it("records HTTP command replies for the authenticated device only", async () => {
    const db = {
      deviceCommand: {
        findFirst: vi.fn().mockResolvedValue(command({ status: "delivered" })),
        update: vi.fn().mockResolvedValue(
          command({
            status: "success",
            result: { ok: true },
            replied_at: now
          })
        )
      }
    };

    const result = await recordHttpDeviceCommandReply(db, {
      context: await context(),
      requestId: "cmd_demo",
      payload: {
        code: 0,
        data: { ok: true }
      }
    });

    expect(db.deviceCommand.findFirst).toHaveBeenCalledWith({
      where: {
        request_id: "cmd_demo",
        org_id: "org_default",
        device_id: "dev_demo"
      }
    });
    expect(db.deviceCommand.update).toHaveBeenCalledWith({
      where: { request_id: "cmd_demo" },
      data: expect.objectContaining({
        status: "success",
        result: { ok: true }
      })
    });
    expect(result.status).toBe("success");
  });
});

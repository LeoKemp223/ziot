import { describe, expect, it, vi } from "vitest";
import { processTelemetryReport } from "./consume-device-reports";

const now = "2026-04-30T01:00:00.000Z";

function device() {
  return {
    id: "dev_demo",
    org_id: "org_default",
    product_id: "prd_demo",
    device_key: "dk_demo",
    product: {
      product_key: "pk_demo"
    }
  };
}

describe("telemetry report worker", () => {
  it("updates reported shadow and creates a device log", async () => {
    const db = {
      device: {
        findFirst: vi.fn().mockResolvedValue(device()),
        update: vi.fn().mockResolvedValue({})
      },
      deviceShadow: {
        findUnique: vi.fn().mockResolvedValue({
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

    const result = await processTelemetryReport(db, {
      topic: "/sys/pk_demo/dk_demo/thing/property/post",
      payload: {
        id: "report_1",
        params: {
          temperature: 24,
          humidity: 60
        }
      },
      received_at: now
    });

    expect(result).toEqual({ result: "allow" });
    expect(db.deviceShadow.update).toHaveBeenCalledWith({
      where: { device_id: "dev_demo" },
      data: {
        reported: {
          humidity: 60,
          temperature: 24
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
        level: "info"
      })
    });
  });

  it("rejects invalid report topics without writing", async () => {
    const db = {
      deviceLog: {
        create: vi.fn()
      }
    };

    const result = await processTelemetryReport(db, {
      topic: "/sys/pk_demo/dk_demo/thing/property/set",
      payload: {}
    });

    expect(result).toMatchObject({ result: "deny" });
    expect(db.deviceLog.create).not.toHaveBeenCalled();
  });
});

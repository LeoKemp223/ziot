import { describe, expect, it } from "vitest";
import { validateThingModel } from "./thing-model";

describe("validateThingModel", () => {
  it("accepts a minimal product thing model", () => {
    const result = validateThingModel({
      version: "1.0",
      properties: [
        {
          identifier: "switch",
          name: "开关",
          dataType: "boolean",
          access: "readWrite"
        }
      ],
      events: [],
      services: [
        {
          identifier: "setSwitch",
          name: "设置开关",
          callType: "async",
          input: [
            {
              identifier: "switch",
              dataType: "boolean",
              required: true
            }
          ],
          output: []
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate property identifiers", () => {
    const result = validateThingModel({
      version: "1.0",
      properties: [
        { identifier: "switch", name: "开关", dataType: "boolean" },
        { identifier: "switch", name: "开关 2", dataType: "boolean" }
      ],
      events: [],
      services: []
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain("properties identifier duplicated: switch");
  });

  it("rejects non-object thing models", () => {
    const result = validateThingModel(null);

    expect(result).toEqual({
      success: false,
      errors: ["thing model must be an object"]
    });
  });

  it("rejects duplicate event and service identifiers", () => {
    const result = validateThingModel({
      version: "1.0",
      properties: [],
      events: [
        { identifier: "alarm", name: "告警" },
        { identifier: "alarm", name: "告警 2" }
      ],
      services: [
        { identifier: "setSwitch", name: "设置", callType: "async" },
        { identifier: "setSwitch", name: "设置 2", callType: "async" }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain("events identifier duplicated: alarm");
    expect(result.errors).toContain("services identifier duplicated: setSwitch");
  });

  it("rejects unsupported property data types and missing identifiers", () => {
    const result = validateThingModel({
      version: "1.0",
      properties: [
        { identifier: "bad", name: "坏字段", dataType: "float64" },
        { name: "无标识", dataType: "boolean" }
      ],
      events: [],
      services: []
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain("unsupported dataType: float64");
    expect(result.errors).toContain("identifier must be a string");
  });
});

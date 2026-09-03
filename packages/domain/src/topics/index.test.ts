import { describe, expect, it } from "vitest";
import {
  buildPropertySetReplyTopic,
  buildServiceInvokeTopic,
  parseTopic
} from "./index";

describe("topics", () => {
  it("parses property report topics", () => {
    expect(parseTopic("/sys/pk_001/dk_001/thing/property/post")).toEqual({
      namespace: "sys",
      productKey: "pk_001",
      deviceKey: "dk_001",
      messageType: "property.post"
    });
  });

  it("parses property set topics", () => {
    expect(parseTopic("/sys/pk_001/dk_001/thing/property/set")).toEqual({
      namespace: "sys",
      productKey: "pk_001",
      deviceKey: "dk_001",
      messageType: "property.set"
    });
  });

  it("parses property set reply topics", () => {
    expect(parseTopic("/sys/pk_001/dk_001/thing/property/set_reply")).toEqual({
      namespace: "sys",
      productKey: "pk_001",
      deviceKey: "dk_001",
      messageType: "property.set_reply"
    });
  });

  it("parses service reply topics", () => {
    expect(parseTopic("/sys/pk_001/dk_001/thing/service/setSwitch/reply"))
      .toEqual({
        namespace: "sys",
        productKey: "pk_001",
        deviceKey: "dk_001",
        messageType: "service.reply",
        identifier: "setSwitch"
      });
  });

  it("parses event and log report topics", () => {
    expect(parseTopic("/sys/pk_001/dk_001/thing/event/post")).toMatchObject({
      messageType: "event.post"
    });
    expect(parseTopic("/sys/pk_001/dk_001/thing/log/post")).toMatchObject({
      messageType: "log.post"
    });
  });

  it("parses OTA upgrade topics", () => {
    expect(parseTopic("/ota/pk_001/dk_001/upgrade/progress")).toEqual({
      namespace: "ota",
      productKey: "pk_001",
      deviceKey: "dk_001",
      messageType: "upgrade.progress"
    });
  });

  it("returns null for unknown or incomplete topics", () => {
    expect(parseTopic("/sys/pk_001")).toBeNull();
    expect(parseTopic("/sys/pk_001/dk_001/thing/property/get")).toBeNull();
    expect(parseTopic("/sys/pk_001/dk_001/thing/property/post/extra")).toBeNull();
    expect(parseTopic("/sys/pk_001/dk_001/thing/service/reply")).toBeNull();
  });

  it("builds service invoke topics", () => {
    expect(buildServiceInvokeTopic("pk_001", "dk_001", "setSwitch")).toBe(
      "/sys/pk_001/dk_001/thing/service/setSwitch/invoke"
    );
  });

  it("builds property set reply topics", () => {
    expect(buildPropertySetReplyTopic("pk_001", "dk_001")).toBe(
      "/sys/pk_001/dk_001/thing/property/set_reply"
    );
  });
});

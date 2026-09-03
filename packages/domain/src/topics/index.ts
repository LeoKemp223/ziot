export type ParsedTopic = {
  namespace: "sys" | "ota";
  productKey: string;
  deviceKey: string;
  messageType: string;
  identifier?: string;
};

export function parseTopic(topic: string): ParsedTopic | null {
  const parts = topic.split("/").filter(Boolean);

  if (parts.length < 5) {
    return null;
  }

  if (!parts[1] || !parts[2]) {
    return null;
  }

  if (parts[0] === "sys" && parts[3] === "thing") {
    if (parts.length === 6 && parts[4] === "property" && parts[5] === "post") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "property.post"
      };
    }

    if (
      parts.length === 6 &&
      parts[4] === "property" &&
      (parts[5] === "set" || parts[5] === "set_reply")
    ) {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: `property.${parts[5] ?? ""}`
      };
    }

    if (parts.length === 6 && parts[4] === "event" && parts[5] === "post") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "event.post"
      };
    }

    if (parts.length === 6 && parts[4] === "log" && parts[5] === "post") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "log.post"
      };
    }

    if (parts.length === 7 && parts[4] === "service" && parts[5] && parts[6] === "reply") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "service.reply",
        identifier: parts[5] ?? ""
      };
    }
  }

  if (parts.length === 5 && parts[0] === "ota" && parts[3] === "upgrade" && parts[4]) {
    return {
      namespace: "ota",
      productKey: parts[1] ?? "",
      deviceKey: parts[2] ?? "",
      messageType: `upgrade.${parts[4] ?? ""}`
    };
  }

  return null;
}

export function buildPropertySetReplyTopic(productKey: string, deviceKey: string) {
  return `/sys/${productKey}/${deviceKey}/thing/property/set_reply`;
}

export function buildServiceInvokeTopic(
  productKey: string,
  deviceKey: string,
  identifier: string
): string {
  return `/sys/${productKey}/${deviceKey}/thing/service/${identifier}/invoke`;
}

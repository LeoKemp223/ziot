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

  if (parts[0] === "sys" && parts[3] === "thing") {
    if (parts[4] === "property" && parts[5] === "post") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "property.post"
      };
    }

    if (parts[4] === "event" && parts[5] === "post") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "event.post"
      };
    }

    if (parts[4] === "log" && parts[5] === "post") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "log.post"
      };
    }

    if (parts[4] === "service" && parts[6] === "reply") {
      return {
        namespace: "sys",
        productKey: parts[1] ?? "",
        deviceKey: parts[2] ?? "",
        messageType: "service.reply",
        identifier: parts[5] ?? ""
      };
    }
  }

  if (parts[0] === "ota" && parts[3] === "upgrade") {
    return {
      namespace: "ota",
      productKey: parts[1] ?? "",
      deviceKey: parts[2] ?? "",
      messageType: `upgrade.${parts[4] ?? ""}`
    };
  }

  return null;
}

export function buildServiceInvokeTopic(
  productKey: string,
  deviceKey: string,
  identifier: string
): string {
  return `/sys/${productKey}/${deviceKey}/thing/service/${identifier}/invoke`;
}

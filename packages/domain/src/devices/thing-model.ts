export type DataType =
  | "boolean"
  | "integer"
  | "number"
  | "string"
  | "enum"
  | "object"
  | "array";

export type ThingModelParam = {
  identifier: string;
  dataType: DataType;
  required?: boolean;
};

export type ThingModelProperty = ThingModelParam & {
  name: string;
  access?: "readOnly" | "writeOnly" | "readWrite";
  unit?: string;
  min?: number;
  max?: number;
};

export type ThingModelEvent = {
  identifier: string;
  name: string;
  level?: "info" | "warn" | "error";
  params?: ThingModelParam[];
};

export type ThingModelService = {
  identifier: string;
  name: string;
  callType: "sync" | "async";
  input?: ThingModelParam[];
  output?: ThingModelParam[];
};

export type ThingModel = {
  version: string;
  properties: ThingModelProperty[];
  events: ThingModelEvent[];
  services: ThingModelService[];
};

export type ThingModelValidationResult =
  | { success: true; data: ThingModel; errors: [] }
  | { success: false; errors: string[] };

const dataTypes = new Set<DataType>([
  "boolean",
  "integer",
  "number",
  "string",
  "enum",
  "object",
  "array"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findDuplicates(items: Array<{ identifier?: unknown }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (typeof item.identifier !== "string") {
      continue;
    }

    if (seen.has(item.identifier)) {
      duplicates.add(item.identifier);
    }

    seen.add(item.identifier);
  }

  return [...duplicates];
}

export function validateThingModel(input: unknown): ThingModelValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { success: false, errors: ["thing model must be an object"] };
  }

  const properties = Array.isArray(input.properties) ? input.properties : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const services = Array.isArray(input.services) ? input.services : [];

  for (const duplicate of findDuplicates(properties)) {
    errors.push(`properties identifier duplicated: ${duplicate}`);
  }

  for (const duplicate of findDuplicates(events)) {
    errors.push(`events identifier duplicated: ${duplicate}`);
  }

  for (const duplicate of findDuplicates(services)) {
    errors.push(`services identifier duplicated: ${duplicate}`);
  }

  for (const item of [...properties, ...events, ...services]) {
    if (!isRecord(item) || typeof item.identifier !== "string") {
      errors.push("identifier must be a string");
    }
  }

  for (const property of properties) {
    if (
      isRecord(property) &&
      typeof property.dataType === "string" &&
      !dataTypes.has(property.dataType as DataType)
    ) {
      errors.push(`unsupported dataType: ${property.dataType}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      version: String(input.version ?? "1.0"),
      properties: properties as ThingModelProperty[],
      events: events as ThingModelEvent[],
      services: services as ThingModelService[]
    },
    errors: []
  };
}

import { z } from "zod";

type JsonSchema = Record<string, unknown>;

export function jsonObjectSchemaToZodRawShape(schema: JsonSchema): Record<string, z.ZodTypeAny> {
  const properties = asRecord(schema.properties);
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      const zodSchema = jsonSchemaToZod(asRecord(value));
      return [key, required.has(key) ? zodSchema : zodSchema.optional()];
    })
  );
}

function jsonSchemaToZod(schema: JsonSchema): z.ZodTypeAny {
  if (Array.isArray(schema.anyOf)) {
    const options = schema.anyOf.map((item) => jsonSchemaToZod(asRecord(item)));
    if (options.length === 0) return z.unknown();
    if (options.length === 1) return options[0] ?? z.unknown();
    return z.union(options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  if (Array.isArray(schema.enum)) {
    const values = schema.enum.filter((item): item is string => typeof item === "string");
    if (values.length > 0) return z.enum(values as [string, ...string[]]);
  }

  if (typeof schema.const === "string") {
    return z.literal(schema.const);
  }

  switch (schema.type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(jsonSchemaToZod(asRecord(schema.items)));
    case "object": {
      const shape = jsonObjectSchemaToZodRawShape(schema);
      const object = z.object(shape);
      return schema.additionalProperties === false ? object : object.passthrough();
    }
    default:
      return z.unknown();
  }
}

function asRecord(value: unknown): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonSchema) : {};
}

export interface ToolNameMapping {
  canonicalName: string;
  transportName: string;
}

export type ToolNameStyle = "canonical" | "safe";

export function toTransportToolName(canonicalName: string, style: ToolNameStyle = "safe"): string {
  return style === "canonical" ? canonicalName : canonicalName.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createToolNameMap(canonicalNames: string[], style: ToolNameStyle = "safe"): ToolNameMapping[] {
  return canonicalNames.map((canonicalName) => ({
    canonicalName,
    transportName: toTransportToolName(canonicalName, style)
  }));
}

export function findCanonicalName(mappings: ToolNameMapping[], transportName: string): string | undefined {
  return mappings.find((mapping) => mapping.transportName === transportName || mapping.canonicalName === transportName)?.canonicalName;
}

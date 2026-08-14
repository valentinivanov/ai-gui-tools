import type { AgentUI, ToolDefinition, ToolResult, UIEvent } from "@agentui/core";

export interface OpenAIFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface OpenAIFunctionCallLike {
  type?: string;
  call_id?: string;
  id?: string;
  name?: string;
  arguments?: string | Record<string, unknown>;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

export interface OpenAIFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface AgentUIOpenAIAdapter {
  tools(): OpenAIFunctionTool[];
  handle(toolCall: OpenAIFunctionCallLike): Promise<OpenAIFunctionCallOutput | null>;
  eventInput(event: UIEvent): string;
}

export function createOpenAIAdapter(ui: AgentUI): AgentUIOpenAIAdapter {
  const nameMap = new Map(ui.toolProvider.definitions().map((definition) => [toProviderToolName(definition.name), definition.name]));

  return {
    tools: () => tools(ui),
    handle: async (toolCall) => {
      const decoded = decodeToolCall(toolCall);
      if (!decoded) {
        return null;
      }

      const coreName = nameMap.get(decoded.name) ?? decoded.name;
      if (!nameMap.has(decoded.name) && ![...nameMap.values()].includes(decoded.name)) {
        return null;
      }

      const result = await ui.handleToolCall(coreName, decoded.args);
      return {
        type: "function_call_output",
        call_id: decoded.callId,
        output: JSON.stringify(result)
      };
    },
    eventInput: (event) => `User interacted with AgentUI: ${JSON.stringify(event)}`
  };
}

export const openAI = {
  tools,
  adapter: createOpenAIAdapter
};

export function tools(ui: AgentUI): OpenAIFunctionTool[] {
  return ui.toolProvider.definitions().map(toOpenAITool);
}

export function toOpenAITool(definition: ToolDefinition): OpenAIFunctionTool {
  return {
    type: "function",
    name: toProviderToolName(definition.name),
    description: `${definition.description} Canonical AgentUI tool: ${definition.name}.`,
    parameters: definition.parameters,
    strict: false
  };
}

export function toProviderToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function decodeToolCall(
  toolCall: OpenAIFunctionCallLike
): { callId: string; name: string; args: Record<string, unknown> } | null {
  const name = toolCall.name ?? toolCall.function?.name;
  if (!name) {
    return null;
  }

  const callId = toolCall.call_id ?? toolCall.id ?? name;
  const rawArgs = toolCall.arguments ?? toolCall.function?.arguments ?? {};
  const args = typeof rawArgs === "string" ? parseArgs(rawArgs) : rawArgs;

  return { callId, name, args };
}

function parseArgs(raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OpenAI tool arguments must decode to an object");
  }
  return parsed as Record<string, unknown>;
}

export function eventInput(event: UIEvent): string {
  return `User interacted with AgentUI: ${JSON.stringify(event)}`;
}

export type { ToolResult, UIEvent };

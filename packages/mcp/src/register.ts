import { classifyUIEvent, defaultCapabilities, type AgentUI, type AgentUICapability, type ToolDefinition, type UIEvent } from "@agentui/core";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { defaultAgentUIResourceUri, registerAgentUIAppResource } from "./app-resource.js";
import { createToolNameMap, findCanonicalName, toTransportToolName, type ToolNameMapping, type ToolNameStyle } from "./names.js";
import { jsonObjectSchemaToZodRawShape } from "./schema.js";

export interface AgentUIMcpLogger {
  debug(message: string, data?: unknown): void;
}

export interface RegisterAgentUIToolsOptions {
  ui: AgentUI;
  capabilities?: AgentUICapability[];
  toolNameStyle?: ToolNameStyle;
  resourceUri?: string;
  registerAppResource?: boolean;
  logger?: AgentUIMcpLogger;
}

export interface RegisterAgentUIToolsResult {
  resourceUri: string;
  mappings: ToolNameMapping[];
}

export function registerAgentUITools(server: Pick<McpServer, "registerTool" | "registerResource">, options: RegisterAgentUIToolsOptions): RegisterAgentUIToolsResult {
  const capabilities = options.capabilities ?? defaultCapabilities;
  const definitions = options.ui.toolProvider
    .definitions()
    .filter((definition) => capabilities.includes(capabilityFromToolName(definition.name)));
  const resourceUri = options.resourceUri ?? defaultAgentUIResourceUri;
  const mappings = createToolNameMap(definitions.map((definition) => definition.name), options.toolNameStyle ?? "safe");

  if (options.registerAppResource ?? true) {
    registerAgentUIAppResource(server, resourceUri);
  }

  for (const definition of definitions) {
    registerAgentUITool(server, definition, mappings, resourceUri, options);
  }

  registerAppTool(
    server,
    "ui_event",
    {
      title: "AgentUI Event",
      description: "Handle a semantic AgentUI event emitted by an interactive MCP App. Local events update state; model-turn events represent submit/confirm/cancel intent.",
      inputSchema: {
        event: z.unknown()
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"]
        }
      }
    },
    async ({ event }: { event: unknown }) => {
      const uiEvent = event as UIEvent;
      options.ui.handleEvent(uiEvent);
      const policy = classifyUIEvent(uiEvent);
      options.logger?.debug("event received", { event: uiEvent, policy });
      return {
        structuredContent: {
          ok: true,
          event: uiEvent,
          eventPolicy: policy,
          state: options.ui.getState()
        },
        content: [{ type: "text", text: `AgentUI event ${uiEvent.type} (${uiEvent.id}) handled as ${policy}.` }]
      };
    }
  );

  return { resourceUri, mappings };
}

function registerAgentUITool(
  server: Pick<McpServer, "registerTool">,
  definition: ToolDefinition,
  mappings: ToolNameMapping[],
  resourceUri: string,
  options: RegisterAgentUIToolsOptions
): void {
  const transportName = toTransportToolName(definition.name, options.toolNameStyle ?? "safe");
  registerAppTool(
    server,
    transportName,
    {
      title: definition.name,
      description: definition.description,
      inputSchema: jsonObjectSchemaToZodRawShape(definition.parameters),
      _meta: {
        ui: {
          resourceUri,
          visibility: ["model", "app"]
        }
      }
    },
    async (args) => invokeAgentUITool(options.ui, mappings, transportName, args, options.logger)
  );
}

export async function invokeAgentUITool(
  ui: AgentUI,
  mappings: ToolNameMapping[],
  transportName: string,
  args: unknown,
  logger?: AgentUIMcpLogger
): Promise<CallToolResult> {
  const canonicalName = findCanonicalName(mappings, transportName);
  if (!canonicalName) {
    logger?.debug("unknown tool", { transportName });
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown AgentUI tool: ${transportName}` }]
    };
  }

  logger?.debug("tool called", { canonicalName, transportName, args });
  const result = await ui.handleToolCall(canonicalName, args);
  logger?.debug("tool result", { canonicalName, ok: result.ok, state: result.state });

  return {
    isError: !result.ok,
    structuredContent: {
      ok: result.ok,
      canonicalToolName: canonicalName,
      transportToolName: transportName,
      state: ui.getState(),
      result
    },
    content: [{ type: "text", text: result.content }]
  };
}

function capabilityFromToolName(name: string): AgentUICapability {
  return name.replace(/^ui\./, "") as AgentUICapability;
}

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
  replaceExistingViews?: boolean;
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
  let uiSequence = 0;
  let contextSequence = 0;
  const completedEvents = new Map<number, UIEvent>();

  if (options.registerAppResource ?? true) {
    registerAgentUIAppResource(server, resourceUri);
  }

  for (const definition of definitions) {
    registerAgentUITool(server, definition, mappings, resourceUri, options, () => {
      uiSequence++;
      contextSequence = uiSequence;
      return { uiSequence, contextSequence };
    });
  }

  registerAppTool(
    server,
    "ui_event",
    {
      title: "AgentUI Event",
      description: "Handle a semantic AgentUI event emitted by an interactive MCP App. Local events update state; model-turn events represent submit/confirm/cancel intent.",
      inputSchema: {
        event: z.unknown(),
        uiSequence: z.number().optional()
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"]
        }
      }
    },
    async ({ event, uiSequence: eventUiSequence }: { event: unknown; uiSequence?: number | undefined }) => {
      const uiEvent = event as UIEvent;
      options.ui.handleEvent(uiEvent);
      const policy = classifyUIEvent(uiEvent);
      if (policy === "model") {
        contextSequence++;
        if (typeof eventUiSequence === "number") {
          completedEvents.set(eventUiSequence, uiEvent);
        }
      }
      options.logger?.debug("event received", { event: uiEvent, policy });
      return {
        structuredContent: {
          ok: true,
          event: uiEvent,
          eventPolicy: policy,
          state: options.ui.getState(),
          agentuiRevision: contextSequence,
          agentuiUiSequence: uiSequence,
          agentuiContextSequence: contextSequence,
          agentuiCompletedEvents: Object.fromEntries(completedEvents)
        },
        content: [{ type: "text", text: `AgentUI event ${uiEvent.type} (${uiEvent.id}) handled as ${policy}.` }]
      };
    }
  );

  registerAppTool(
    server,
    "ui_state",
    {
      title: "AgentUI State",
      description: "Return the current AgentUI state for an interactive MCP App frame.",
      inputSchema: {},
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"]
        }
      }
    },
    async () => ({
      structuredContent: {
        ok: true,
        state: options.ui.getState(),
        agentuiRevision: contextSequence,
        agentuiUiSequence: uiSequence,
        agentuiContextSequence: contextSequence,
        agentuiCompletedEvents: Object.fromEntries(completedEvents)
      },
      content: [{ type: "text", text: "Current AgentUI state returned." }]
    })
  );

  return { resourceUri, mappings };
}

function registerAgentUITool(
  server: Pick<McpServer, "registerTool">,
  definition: ToolDefinition,
  mappings: ToolNameMapping[],
  resourceUri: string,
  options: RegisterAgentUIToolsOptions,
  nextSequence: () => { uiSequence: number; contextSequence: number }
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
        },
        "openai/outputTemplate": resourceUri
      }
    },
    async (args) => {
      const output = await invokeAgentUITool(options.ui, mappings, transportName, args, options.logger, options.replaceExistingViews ?? true);
      if (!output.isError) attachSequence(output, nextSequence());
      return output;
    }
  );
}

export async function invokeAgentUITool(
  ui: AgentUI,
  mappings: ToolNameMapping[],
  transportName: string,
  args: unknown,
  logger?: AgentUIMcpLogger,
  replaceExistingViews = true
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
  const previousViewIds = new Set(ui.getState().views.map((view) => view.id));
  const result = await ui.handleToolCall(canonicalName, args);
  if (result.ok && replaceExistingViews) {
    retainActiveView(ui, previousViewIds, requestedViewId(canonicalName, args));
  }
  const state = ui.getState();
  logger?.debug("tool result", { canonicalName, ok: result.ok, state });

  return {
    isError: !result.ok,
    structuredContent: {
      ok: result.ok,
      canonicalToolName: canonicalName,
      transportToolName: transportName,
      state,
      result: { ...result, state }
    },
    content: [{ type: "text", text: result.content }]
  };
}

function capabilityFromToolName(name: string): AgentUICapability {
  return name.replace(/^ui\./, "") as AgentUICapability;
}

function attachSequence(output: CallToolResult, sequence: { uiSequence: number; contextSequence: number }): void {
  const structuredContent = (output.structuredContent && typeof output.structuredContent === "object" ? output.structuredContent : {}) as Record<string, unknown>;
  structuredContent.agentuiRevision = sequence.contextSequence;
  structuredContent.agentuiUiSequence = sequence.uiSequence;
  structuredContent.agentuiContextSequence = sequence.contextSequence;

  const result = structuredContent.result;
  if (result && typeof result === "object") {
    (result as Record<string, unknown>).agentuiRevision = sequence.contextSequence;
    (result as Record<string, unknown>).agentuiUiSequence = sequence.uiSequence;
    (result as Record<string, unknown>).agentuiContextSequence = sequence.contextSequence;
  }

  output.structuredContent = structuredContent;
}

function retainActiveView(ui: AgentUI, previousViewIds: Set<string>, requestedId: string | undefined): void {
  const views = ui.getState().views;
  const activeView =
    (requestedId ? views.find((view) => view.id === requestedId) : undefined) ??
    views.find((view) => !previousViewIds.has(view.id)) ??
    views.at(-1);

  if (!activeView) return;

  for (const view of views) {
    if (view.id !== activeView.id) {
      ui.dispatch({ type: "close_view", id: view.id });
    }
  }
}

function requestedViewId(toolName: string, args: unknown): string | undefined {
  const data = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  if (toolName === "ui.view.replace") {
    const view = data.view;
    return view && typeof view === "object" && typeof (view as Record<string, unknown>).id === "string"
      ? ((view as Record<string, unknown>).id as string)
      : undefined;
  }
  return typeof data.viewId === "string" ? data.viewId : undefined;
}

import { describe, expect, it, vi } from "vitest";
import { createAgentUI } from "@agentui/core";
import { defaultAgentUIResourceUri, invokeAgentUITool, registerAgentUITools } from "../src/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createFakeServer() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: (args: unknown) => unknown }>();
  const resources = new Map<string, { uri: string; config: Record<string, unknown>; handler: () => unknown }>();
  return {
    tools,
    resources,
    registerTool(name: string, config: Record<string, unknown>, handler: (args: unknown) => unknown) {
      tools.set(name, { config, handler });
      return { enabled: true, enable() {}, disable() {}, remove() {}, update() {} };
    },
    registerResource(name: string, uri: string, config: Record<string, unknown>, handler: (...args: unknown[]) => unknown) {
      resources.set(name, { uri, config, handler });
      return { name, enabled: true, enable() {}, disable() {}, remove() {}, update() {} };
    }
  } as unknown as Pick<McpServer, "registerTool" | "registerResource"> & {
    tools: Map<string, { config: Record<string, unknown>; handler: (args: unknown) => unknown }>;
    resources: Map<string, { uri: string; config: Record<string, unknown>; handler: (...args: unknown[]) => unknown }>;
  };
}

describe("@agentui/mcp", () => {
  it("registers semantic AgentUI tools with mapped names and UI metadata", () => {
    const ui = createAgentUI();
    const server = createFakeServer();

    const result = registerAgentUITools(server, { ui });

    expect(result.mappings).toContainEqual({ canonicalName: "ui.form", transportName: "ui_form" });
    expect(server.tools.has("ui_form")).toBe(true);
    expect(server.tools.get("ui_form")?.config).toMatchObject({
      _meta: { ui: { resourceUri: defaultAgentUIResourceUri } }
    });
    expect(server.resources.size).toBe(1);
  });

  it("updates AgentUI state when a mapped MCP tool is invoked", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    const result = registerAgentUITools(server, { ui });

    const output = await invokeAgentUITool(ui, result.mappings, "ui_form", {
      viewId: "project",
      title: "Project configuration",
      fields: [{ type: "select", id: "language", label: "Language", options: [{ label: "TypeScript", value: "typescript" }] }]
    });

    expect(output.isError).toBe(false);
    expect(ui.getState().views[0]?.id).toBe("project");
    expect(output.structuredContent).toMatchObject({ ok: true, canonicalToolName: "ui.form" });
  });

  it("returns an MCP error result for invalid payloads", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    const result = registerAgentUITools(server, { ui });

    const output = await invokeAgentUITool(ui, result.mappings, "ui_form", {
      title: "Missing view id",
      fields: []
    });

    expect(output.isError).toBe(true);
    expect(output.content[0]).toMatchObject({ type: "text" });
  });

  it("honors capability restrictions", () => {
    const ui = createAgentUI({ capabilities: ["form", "confirm"] });
    const server = createFakeServer();

    registerAgentUITools(server, { ui, capabilities: ["form"] });

    expect(server.tools.has("ui_form")).toBe(true);
    expect(server.tools.has("ui_confirm")).toBe(false);
  });

  it("handles semantic UI events and classifies local versus model-turn events", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    registerAgentUITools(server, { ui });
    const eventTool = server.tools.get("ui_event");

    expect(eventTool).toBeDefined();
    const output = await eventTool!.handler({ event: { type: "change", id: "language", value: "typescript" } });

    expect(output).toMatchObject({
      structuredContent: { ok: true, eventPolicy: "local" }
    });
  });

  it("logs useful debug events", async () => {
    const ui = createAgentUI();
    const debug = vi.fn();
    const server = createFakeServer();
    const result = registerAgentUITools(server, { ui, logger: { debug } });

    await invokeAgentUITool(
      ui,
      result.mappings,
      "ui_form",
      {
        viewId: "project",
        title: "Project configuration",
        fields: []
      },
      { debug }
    );

    expect(debug).toHaveBeenCalledWith("tool called", expect.anything());
    expect(debug).toHaveBeenCalledWith("tool result", expect.anything());
  });
});

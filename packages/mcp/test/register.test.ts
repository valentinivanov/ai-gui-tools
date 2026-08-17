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
    expect(result.mappings).toContainEqual({ canonicalName: "ui.plot", transportName: "ui_plot" });
    expect(server.tools.has("ui_form")).toBe(true);
    expect(server.tools.has("ui_plot")).toBe(true);
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

  it("keeps only the active view by default across model UI calls", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    const result = registerAgentUITools(server, { ui });

    await invokeAgentUITool(ui, result.mappings, "ui_table", {
      viewId: "summary",
      title: "Summary",
      columns: [{ key: "name", label: "Name" }],
      rows: [{ name: "web" }]
    });
    await invokeAgentUITool(ui, result.mappings, "ui_form", {
      viewId: "deployment",
      title: "Deployment",
      fields: [{ type: "input", id: "service", label: "Service" }]
    });

    expect(ui.getState().views.map((view) => view.id)).toEqual(["deployment"]);
    expect(ui.getState().views[0]?.children[0]?.type).toBe("form");
  });

  it("keeps only the last view for repeated table calls by default", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    const result = registerAgentUITools(server, { ui });

    for (const viewId of ["intact", "changed", "entered"]) {
      await invokeAgentUITool(ui, result.mappings, "ui_table", {
        viewId,
        title: viewId,
        columns: [{ key: "name", label: "Name" }],
        rows: [{ name: viewId }]
      });
    }

    expect(ui.getState().views.map((view) => view.id)).toEqual(["entered"]);
    expect(ui.getState().views[0]?.children[0]?.type).toBe("table");
  });

  it("renders multiple UI elements through an explicit container", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    const result = registerAgentUITools(server, { ui });

    await invokeAgentUITool(ui, result.mappings, "ui_container", {
      viewId: "form-values",
      title: "Form values",
      children: ["intact", "changed", "entered"].map((name) => ({
        type: "container",
        title: name,
        children: [
          {
            type: "table",
            columns: [{ key: "name", label: "Name" }],
            rows: [{ name }]
          }
        ]
      }))
    });

    expect(ui.getState().views.map((view) => view.id)).toEqual(["form-values"]);
    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("container");
    if (widget?.type === "container") {
      expect(widget.children).toHaveLength(3);
    }
  });

  it("can preserve multiple views when configured", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    registerAgentUITools(server, { ui, replaceExistingViews: false });

    await server.tools.get("ui_table")!.handler({
      viewId: "summary",
      title: "Summary",
      columns: [{ key: "name", label: "Name" }],
      rows: [{ name: "web" }]
    });
    await server.tools.get("ui_form")!.handler({
      viewId: "deployment",
      title: "Deployment",
      fields: [{ type: "input", id: "service", label: "Service" }]
    });

    expect(ui.getState().views.map((view) => view.id)).toEqual(["summary", "deployment"]);
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

  it("exposes current app-only state with a revision", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    registerAgentUITools(server, { ui });

    await server.tools.get("ui_form")!.handler({
      viewId: "project",
      title: "Project",
      fields: [{ type: "input", id: "name", label: "Name" }]
    });
    const output = await server.tools.get("ui_state")!.handler({});

    expect(output).toMatchObject({
      structuredContent: {
        ok: true,
        agentuiRevision: 1,
        agentuiUiSequence: 1,
        agentuiContextSequence: 1,
        state: { views: [{ id: "project" }] }
      }
    });
  });

  it("increments the state revision for UI events", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    registerAgentUITools(server, { ui });

    await server.tools.get("ui_form")!.handler({
      viewId: "project",
      title: "Project",
      fields: [{ type: "input", id: "name", label: "Name" }]
    });
    await server.tools.get("ui_event")!.handler({ event: { type: "submit", id: "project:form", values: { name: "demo" } }, uiSequence: 1 });
    const output = await server.tools.get("ui_state")!.handler({});

    expect(output).toMatchObject({
      structuredContent: {
        ok: true,
        agentuiRevision: 2,
        agentuiUiSequence: 1,
        agentuiContextSequence: 2,
        agentuiCompletedEvents: {
          "1": { type: "submit", id: "project:form", values: { name: "demo" } }
        },
        state: { views: [] }
      }
    });
  });

  it("keeps context sequence aligned to the newest model-rendered UI", async () => {
    const ui = createAgentUI();
    const server = createFakeServer();
    registerAgentUITools(server, { ui });

    await server.tools.get("ui_form")!.handler({
      viewId: "first",
      title: "First",
      fields: []
    });
    await server.tools.get("ui_table")!.handler({
      viewId: "second",
      title: "Second",
      columns: [{ key: "name", label: "Name" }],
      rows: [{ name: "demo" }]
    });
    const output = await server.tools.get("ui_state")!.handler({});

    expect(output).toMatchObject({
      structuredContent: {
        agentuiRevision: 2,
        agentuiUiSequence: 2,
        agentuiContextSequence: 2,
        state: { views: [{ id: "second" }] }
      }
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

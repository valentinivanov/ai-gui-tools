import { describe, expect, it, vi } from "vitest";
import { createAgentUI } from "../src/index.js";

describe("AgentUI core", () => {
  it("replaces views from semantic tool calls", async () => {
    const ui = createAgentUI();

    const result = await ui.handleToolCall("ui.form", {
      viewId: "deployment",
      title: "Deployment",
      fields: [
        { type: "select", id: "environment", label: "Environment", options: [{ label: "Production", value: "prod" }] },
        { type: "input", id: "replicas", label: "Replicas", inputType: "number", value: 3 },
        { type: "checkbox", id: "autoscaling", label: "Autoscaling", checked: true }
      ],
      submitLabel: "Deploy"
    });

    expect(result.ok).toBe(true);
    expect(ui.getState().views).toHaveLength(1);
    expect(ui.getState().views[0]?.children[0]?.type).toBe("form");
  });

  it("updates field values when UI events arrive", async () => {
    const ui = createAgentUI();
    await ui.handleToolCall("ui.form", {
      viewId: "deployment",
      title: "Deployment",
      fields: [{ type: "input", id: "replicas", label: "Replicas", inputType: "number", value: 3 }]
    });

    ui.handleEvent({ type: "change", id: "replicas", value: 5 });
    const form = ui.getState().views[0]?.children[0];

    expect(form?.type).toBe("form");
    if (form?.type === "form") {
      expect(form.fields[0]).toMatchObject({ id: "replicas", value: 5 });
    }
  });

  it("creates a container view for grouped widgets", async () => {
    const ui = createAgentUI();

    const result = await ui.handleToolCall("ui.container", {
      viewId: "grouped",
      title: "Grouped results",
      children: [
        { type: "markdown", markdown: "Summary" },
        { type: "separator" },
        { type: "table", columns: [{ key: "name", label: "Name" }], rows: [{ name: "entered" }] }
      ]
    });

    expect(result.ok).toBe(true);
    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("container");
    if (widget?.type === "container") {
      expect(widget.children).toHaveLength(3);
      expect(widget.children[1]?.type).toBe("separator");
    }
  });

  it("stores an optional table name", async () => {
    const ui = createAgentUI();

    await ui.handleToolCall("ui.table", {
      viewId: "values",
      title: "Values",
      name: "Submitted values",
      columns: [{ key: "field", label: "Field" }],
      rows: [{ field: "environment" }]
    });

    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("table");
    if (widget?.type === "table") {
      expect(widget.name).toBe("Submitted values");
    }
  });

  it("creates a plot view for 2D points", async () => {
    const ui = createAgentUI();

    await ui.handleToolCall("ui.plot", {
      viewId: "latency",
      title: "Latency",
      mode: "lines",
      points: [
        { x: 0, y: 12 },
        { x: 1, y: 18 },
        { x: 2, y: 14 }
      ]
    });

    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("plot");
    if (widget?.type === "plot") {
      expect(widget.mode).toBe("lines");
      expect(widget.points).toEqual([
        { x: 0, y: 12 },
        { x: 1, y: 18 },
        { x: 2, y: 14 }
      ]);
    }
  });

  it("creates a prebuilt Pong WASM applet view", async () => {
    const ui = createAgentUI();

    await ui.handleToolCall("ui.applet-pong", {
      viewId: "pong",
      title: "Pong",
      id: "pong-game"
    });

    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("wasm-applet");
    if (widget?.type === "wasm-applet") {
      expect(widget.module.name).toBe("pong");
      expect(widget.capabilities).toContain("keyboard");
      expect(widget.width).toBe(640);
    }
  });

  it("can still create a generic WASM applet when the explicit capability is enabled", async () => {
    const ui = createAgentUI({ capabilities: ["applet"] });

    await ui.handleToolCall("ui.applet", {
      viewId: "custom",
      title: "Custom",
      id: "custom-applet",
      module: { name: "custom", url: "/applets/custom/applet.wasm" },
      capabilities: ["canvas", "timer"]
    });

    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("wasm-applet");
    if (widget?.type === "wasm-applet") {
      expect(widget.module.url).toBe("/applets/custom/applet.wasm");
    }
  });

  it("passes semantic applet events to subscribers without updating local controls", () => {
    const ui = createAgentUI();
    const listener = vi.fn();
    ui.subscribeEvents(listener);
    const event = { type: "applet_event" as const, id: "pong-game", event: { type: "game_over", payload: { score: 12 } } };

    ui.handleEvent(event);

    expect(listener).toHaveBeenCalledWith(event, ui.getState());
  });

  it("closes an applet view after an exit applet event", async () => {
    const ui = createAgentUI();
    await ui.handleToolCall("ui.applet-pong", {
      viewId: "pong",
      title: "Pong",
      id: "pong-game"
    });

    ui.handleEvent({ type: "applet_event", id: "pong-game", event: { type: "exit", payload: { reason: "title" } } });

    expect(ui.getState().views).toEqual([]);
  });

  it("computes a unified diff when patch is omitted and diff is available", async () => {
    const ui = createAgentUI();

    await ui.handleToolCall("ui.diff", {
      viewId: "review",
      title: "Review",
      files: [{ path: "app.ts", oldText: "const port = 3000;\n", newText: "const port = 8080;\n" }]
    });

    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("diff");
    if (widget?.type === "diff") {
      expect(widget.files[0]?.patch).toContain("-const port = 3000;");
      expect(widget.files[0]?.patch).toContain("+const port = 8080;");
    }
  });

  it("keeps caller-provided diff patches unchanged", async () => {
    const ui = createAgentUI();
    const patch = "@@ custom patch @@";

    await ui.handleToolCall("ui.diff", {
      viewId: "review",
      title: "Review",
      files: [{ path: "app.ts", oldText: "before", newText: "after", patch }]
    });

    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("diff");
    if (widget?.type === "diff") {
      expect(widget.files[0]?.patch).toBe(patch);
    }
  });

  it("accepts tableName as an alias for table name", async () => {
    const ui = createAgentUI();

    await ui.handleToolCall("ui.table", {
      viewId: "values",
      title: "Values",
      tableName: "Submitted values",
      columns: [{ key: "field", label: "Field" }],
      rows: [{ field: "environment" }]
    });

    const widget = ui.getState().views[0]?.children[0];
    expect(widget?.type).toBe("table");
    if (widget?.type === "table") {
      expect(widget.name).toBe("Submitted values");
    }
  });

  it("closes a form view after submit while preserving submitted values on the event", async () => {
    const ui = createAgentUI();
    const listener = vi.fn();
    ui.subscribeEvents(listener);
    await ui.handleToolCall("ui.form", {
      viewId: "deployment",
      title: "Deployment",
      fields: [{ type: "input", id: "replicas", label: "Replicas", inputType: "number", value: 3 }]
    });

    const event = { type: "submit" as const, id: "deployment:form", values: { replicas: 5 } };
    ui.handleEvent(event);

    expect(ui.getState().views).toEqual([]);
    expect(listener).toHaveBeenCalledWith(event, ui.getState());
  });

  it("closes a confirmation view after confirm or cancel", async () => {
    const ui = createAgentUI();
    await ui.handleToolCall("ui.confirm", {
      viewId: "danger",
      id: "delete",
      title: "Delete deployment?",
      message: "This cannot be undone."
    });

    ui.handleEvent({ type: "click", id: "delete:confirm" });

    expect(ui.getState().views).toEqual([]);
  });

  it("notifies event subscribers after state updates", async () => {
    const ui = createAgentUI();
    const listener = vi.fn();
    ui.subscribeEvents(listener);
    await ui.handleToolCall("ui.confirm", {
      viewId: "danger",
      id: "delete",
      title: "Delete deployment?",
      message: "This cannot be undone."
    });

    ui.handleEvent({ type: "click", id: "delete:confirm" });

    expect(listener).toHaveBeenCalledWith({ type: "click", id: "delete:confirm" }, ui.getState());
  });

  it("preserves uncontrolled values across whole-view replacement", async () => {
    const ui = createAgentUI();
    await ui.handleToolCall("ui.form", {
      viewId: "deployment",
      title: "Deployment",
      fields: [{ type: "input", id: "replicas", label: "Replicas", inputType: "number" }]
    });
    ui.handleEvent({ type: "change", id: "replicas", value: 7 });

    await ui.handleToolCall("ui.form", {
      viewId: "deployment",
      title: "Deployment",
      fields: [{ type: "input", id: "replicas", label: "Replicas", inputType: "number" }]
    });

    const form = ui.getState().views[0]?.children[0];
    expect(form?.type).toBe("form");
    if (form?.type === "form") {
      expect(form.fields[0]).toMatchObject({ value: 7 });
    }
  });
});

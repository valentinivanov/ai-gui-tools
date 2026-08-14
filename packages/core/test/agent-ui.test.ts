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

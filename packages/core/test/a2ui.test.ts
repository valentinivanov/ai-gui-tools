import { describe, expect, it } from "vitest";
import { a2uiActionToUIEvent, validateA2UISurface, viewToA2UI, widgetsToA2UI } from "../src/index.js";
import type { View } from "../src/index.js";

describe("AgentUI A2UI bridge", () => {
  it("compiles a semantic form view to a valid A2UI surface", () => {
    const view: View = {
      id: "deployment",
      title: "Deployment",
      children: [
        {
          type: "form",
          id: "deployment:form",
          fields: [
            { type: "input", id: "replicas", label: "Replicas", inputType: "number", value: 3 },
            { type: "checkbox", id: "autoscaling", label: "Autoscaling", checked: true }
          ]
        }
      ]
    };

    const surface = viewToA2UI(view);

    validateA2UISurface(surface);
    expect(surface.version).toBe("v1.0");
    expect(surface.surfaceId).toBe("deployment");
    expect(surface.components.some((component) => component.component === "TextField")).toBe(true);
    expect(surface.dataModel.forms).toMatchObject({ replicas: 3, autoscaling: true });
  });

  it("compiles semantic table and diff widgets to AgentUI A2UI extension components", () => {
    const { components, fallbackText } = widgetsToA2UI(
      [
        { type: "table", columns: [{ key: "name", label: "Name" }], rows: [{ name: "Postgres" }] },
        { type: "diff", id: "review", files: [{ path: "app.ts", patch: "+ ok" }] }
      ],
      "review"
    );

    expect(components).toContainEqual(expect.objectContaining({ component: "agentui.Table" }));
    expect(components).toContainEqual(expect.objectContaining({ component: "agentui.Diff" }));
    expect(fallbackText).toContain("Postgres");
    expect(fallbackText).toContain("Diff: app.ts");
  });

  it("maps A2UI actions back to AgentUI semantic events", () => {
    expect(a2uiActionToUIEvent({ name: "change", payload: { id: "replicas", value: 4 } }, "field")).toEqual({
      type: "change",
      id: "replicas",
      value: 4
    });
    expect(a2uiActionToUIEvent({ name: "submit", payload: { id: "deployment:form", values: { replicas: 4 } } }, "submit")).toEqual({
      type: "submit",
      id: "deployment:form",
      values: { replicas: 4 }
    });
  });

  it("round-trips the WASM applet extension as serializable A2UI", () => {
    const surface = viewToA2UI({
      id: "pong",
      title: "Pong",
      children: [
        {
          type: "wasm-applet",
          id: "pong-game",
          module: { name: "pong" },
          width: 640,
          height: 360,
          capabilities: ["canvas", "keyboard", "timer", "emit_event"]
        }
      ]
    });
    const serialized = JSON.parse(JSON.stringify(surface)) as typeof surface;

    validateA2UISurface(serialized);
    expect(serialized.components).toContainEqual(expect.objectContaining({ component: "agentui.WasmApplet", module: { name: "pong" } }));
  });
});

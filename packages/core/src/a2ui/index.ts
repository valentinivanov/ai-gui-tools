import type {
  ConfirmationWidget,
  FormField,
  FormWidget,
  PlotWidget,
  TableWidget,
  UIEvent,
  View,
  WasmAppletWidget,
  Widget
} from "../types.js";

export const A2UI_PROTOCOL_VERSION = "v1.0";
export const A2UI_BASIC_CATALOG_ID = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json";
export const AGENTUI_A2UI_EXTENSION_CATALOG_ID = "https://agentui.dev/a2ui/catalogs/agentui/experimental/v0";

export type A2UIDynamicValue<T> = T | { path: string };

export interface A2UIAction {
  name: string;
  payload?: Record<string, unknown> | undefined;
  local?: boolean | undefined;
}

export interface A2UIComponentBase {
  id: string;
  component: string;
  catalogId?: string | undefined;
}

export type A2UIComponent =
  | (A2UIComponentBase & { component: "Text"; text: A2UIDynamicValue<string>; variant?: "caption" | "body" | undefined })
  | (A2UIComponentBase & { component: "Column"; children: string[] })
  | (A2UIComponentBase & { component: "Row"; children: string[]; justify?: string | undefined; align?: string | undefined })
  | (A2UIComponentBase & { component: "Divider"; axis?: "horizontal" | "vertical" | undefined })
  | (A2UIComponentBase & { component: "Card"; child: string })
  | (A2UIComponentBase & { component: "Button"; child: string; variant?: "default" | "primary" | "borderless" | undefined; action: A2UIAction })
  | (A2UIComponentBase & { component: "TextField"; label: A2UIDynamicValue<string>; value?: A2UIDynamicValue<string | number> | undefined; placeholder?: A2UIDynamicValue<string> | undefined; variant?: "longText" | "number" | "shortText" | "obscured" | undefined })
  | (A2UIComponentBase & { component: "CheckBox"; label: A2UIDynamicValue<string>; value: A2UIDynamicValue<boolean> })
  | (A2UIComponentBase & { component: "ChoicePicker"; label?: A2UIDynamicValue<string> | undefined; options: Array<{ label: A2UIDynamicValue<string>; value: string }>; value: A2UIDynamicValue<string[]>; variant?: "multipleSelection" | "mutuallyExclusive" | undefined; displayStyle?: "checkbox" | "chips" | undefined })
  | (A2UIComponentBase & { component: "Tabs"; tabs: Array<{ title: A2UIDynamicValue<string>; child: string }> })
  | (A2UIComponentBase & { component: "agentui.Table"; catalogId: typeof AGENTUI_A2UI_EXTENSION_CATALOG_ID; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>>; name?: string | undefined })
  | (A2UIComponentBase & { component: "agentui.Diff"; catalogId: typeof AGENTUI_A2UI_EXTENSION_CATALOG_ID; files: Array<Record<string, unknown>> })
  | (A2UIComponentBase & { component: "agentui.Plot"; catalogId: typeof AGENTUI_A2UI_EXTENSION_CATALOG_ID; title?: string | undefined; mode: "points" | "lines" | "bars"; points: Array<{ x: number; y: number }> })
  | (A2UIComponentBase & { component: "agentui.WasmApplet"; catalogId: typeof AGENTUI_A2UI_EXTENSION_CATALOG_ID; module: WasmAppletWidget["module"]; width?: number | undefined; height?: number | undefined; capabilities: WasmAppletWidget["capabilities"]; initialState?: unknown });

export interface A2UICreateSurfaceMessage {
  version: typeof A2UI_PROTOCOL_VERSION;
  createSurface: {
    surfaceId: string;
    catalogId?: string | undefined;
    sendDataModel?: boolean | undefined;
    components: A2UIComponent[];
    dataModel?: Record<string, unknown> | undefined;
  };
}

export type A2UIMessage =
  | A2UICreateSurfaceMessage
  | { version: typeof A2UI_PROTOCOL_VERSION; updateComponents: { surfaceId: string; components: A2UIComponent[] } }
  | { version: typeof A2UI_PROTOCOL_VERSION; updateDataModel: { surfaceId: string; path?: string | undefined; value: unknown } }
  | { version: typeof A2UI_PROTOCOL_VERSION; deleteSurface: { surfaceId: string } };

export interface A2UISurfaceDocument {
  version: typeof A2UI_PROTOCOL_VERSION;
  surfaceId: string;
  catalogId: string;
  root: "root";
  components: A2UIComponent[];
  dataModel: Record<string, unknown>;
  messages: A2UIMessage[];
  fallbackText: string;
}

interface A2UIBuild {
  components: A2UIComponent[];
  dataModel: Record<string, unknown>;
  fallbackText: string;
}

export function viewToA2UI(view: View): A2UISurfaceDocument {
  if (view.a2ui) return view.a2ui;
  const build = widgetsToA2UI(view.children, view.id);
  return surfaceDocument(view.id, build.components, build.dataModel, build.fallbackText);
}

export function widgetsToA2UI(widgets: Widget[], surfaceId: string): A2UIBuild {
  const components: A2UIComponent[] = [];
  const dataModel: Record<string, unknown> = {};
  const childIds: string[] = [];
  const fallback: string[] = [];

  widgets.forEach((widget, index) => {
    const id = widgetId(widget, `${surfaceId}_widget_${index}`);
    childIds.push(id);
    appendWidget(widget, id, components, dataModel, fallback);
  });

  components.unshift({ id: "root", component: "Column", children: childIds });
  return { components, dataModel, fallbackText: fallback.filter(Boolean).join("\n") };
}

export function surfaceDocument(
  surfaceId: string,
  components: A2UIComponent[],
  dataModel: Record<string, unknown> = {},
  fallbackText = "AgentUI rendered an A2UI surface."
): A2UISurfaceDocument {
  const normalized = components.some((component) => component.id === "root")
    ? components
    : [{ id: "root", component: "Column", children: components.map((component) => component.id) } as A2UIComponent, ...components];
  return {
    version: A2UI_PROTOCOL_VERSION,
    surfaceId,
    catalogId: A2UI_BASIC_CATALOG_ID,
    root: "root",
    components: normalized,
    dataModel,
    messages: [
      {
        version: A2UI_PROTOCOL_VERSION,
        createSurface: {
          surfaceId,
          catalogId: A2UI_BASIC_CATALOG_ID,
          sendDataModel: true,
          components: normalized,
          dataModel
        }
      }
    ],
    fallbackText
  };
}

export function validateA2UISurface(document: A2UISurfaceDocument): void {
  if (document.version !== A2UI_PROTOCOL_VERSION) throw new Error("A2UI surface must use version v1.0");
  if (!document.surfaceId) throw new Error("A2UI surface requires a surfaceId");
  const ids = new Set(document.components.map((component) => component.id));
  if (!ids.has("root")) throw new Error("A2UI surface requires a root component");
  for (const component of document.components) {
    if (!component.id || !component.component) throw new Error("A2UI components require id and component");
    for (const child of referencedChildren(component)) {
      if (!ids.has(child)) throw new Error(`A2UI component ${component.id} references missing child ${child}`);
    }
  }
}

export function a2uiActionToUIEvent(action: A2UIAction, componentId: string): UIEvent {
  if (action.name === "submit") {
    const values = isRecord(action.payload?.values) ? action.payload.values : {};
    return { type: "submit", id: String(action.payload?.id ?? componentId), values };
  }
  if (action.name === "change") {
    return { type: "change", id: String(action.payload?.id ?? componentId), value: action.payload?.value };
  }
  if (action.name === "applet_event") {
    const event = isRecord(action.payload?.event) && typeof action.payload.event.type === "string" ? action.payload.event as { type: string; payload?: unknown } : { type: "unknown" };
    return { type: "applet_event", id: String(action.payload?.id ?? componentId), event };
  }
  return { type: "click", id: String(action.payload?.id ?? componentId) };
}

function appendWidget(widget: Widget, id: string, components: A2UIComponent[], dataModel: Record<string, unknown>, fallback: string[]): void {
  if (widget.type === "text") {
    components.push({ id, component: "Text", text: widget.text });
    fallback.push(widget.text);
  } else if (widget.type === "markdown") {
    components.push({ id, component: "Text", text: widget.markdown });
    fallback.push(widget.markdown);
  } else if (widget.type === "button") {
    const labelId = `${id}_label`;
    components.push({ id: labelId, component: "Text", text: widget.label });
    components.push({ id, component: "Button", child: labelId, variant: widget.variant === "primary" ? "primary" : "default", action: { name: "click", payload: { id: widget.id } } });
    fallback.push(`[Button] ${widget.label}`);
  } else if (widget.type === "checkbox") {
    setPath(dataModel, `/values/${widget.id}`, Boolean(widget.checked));
    components.push({ id, component: "CheckBox", label: widget.label, value: { path: `/values/${widget.id}` } });
    fallback.push(`${widget.label}: ${Boolean(widget.checked)}`);
  } else if (widget.type === "input") {
    setPath(dataModel, `/values/${widget.id}`, widget.value ?? "");
    components.push({ id, component: "TextField", label: widget.label ?? widget.id, value: { path: `/values/${widget.id}` }, placeholder: widget.placeholder, variant: inputVariant(widget.inputType) });
    fallback.push(`${widget.label ?? widget.id}: ${widget.value ?? ""}`);
  } else if (widget.type === "select") {
    setPath(dataModel, `/values/${widget.id}`, widget.value ? [widget.value] : []);
    components.push({ id, component: "ChoicePicker", label: widget.label ?? widget.id, options: widget.options, value: { path: `/values/${widget.id}` }, variant: "mutuallyExclusive", displayStyle: "chips" });
    fallback.push(`${widget.label ?? widget.id}: ${widget.value ?? ""}`);
  } else if (widget.type === "form") {
    appendForm(widget, id, components, dataModel, fallback);
  } else if (widget.type === "container") {
    const childIds = widget.children.map((child, index) => `${id}_${widgetId(child, `child_${index}`)}`);
    widget.children.forEach((child, index) => appendWidget(child, childIds[index] ?? `${id}_child_${index}`, components, dataModel, fallback));
    components.push({ id, component: "Column", children: childIds });
  } else if (widget.type === "separator") {
    components.push({ id, component: "Divider" });
  } else if (widget.type === "table") {
    components.push({ id, component: "agentui.Table", catalogId: AGENTUI_A2UI_EXTENSION_CATALOG_ID, columns: widget.columns, rows: widget.rows, name: widget.name });
    fallback.push(tableFallback(widget));
  } else if (widget.type === "plot") {
    components.push({ id, component: "agentui.Plot", catalogId: AGENTUI_A2UI_EXTENSION_CATALOG_ID, title: widget.title, mode: widget.mode, points: widget.points });
    fallback.push(widget.title ?? "Plot");
  } else if (widget.type === "diff") {
    components.push({ id, component: "agentui.Diff", catalogId: AGENTUI_A2UI_EXTENSION_CATALOG_ID, files: widget.files as unknown as Array<Record<string, unknown>> });
    fallback.push(`Diff: ${widget.files.map((file) => file.path).join(", ")}`);
  } else if (widget.type === "confirmation") {
    appendConfirmation(widget, id, components, fallback);
  } else if (widget.type === "wasm-applet") {
    components.push({ id, component: "agentui.WasmApplet", catalogId: AGENTUI_A2UI_EXTENSION_CATALOG_ID, module: widget.module, width: widget.width, height: widget.height, capabilities: widget.capabilities, initialState: widget.initialState });
    fallback.push(`WASM applet: ${widget.module.name ?? widget.id}`);
  } else if (widget.type === "tabs") {
    const tabs = widget.tabs.map((tab) => {
      const tabRoot = `${id}_${tab.id}`;
      const childIds = tab.children.map((child, index) => `${tabRoot}_${widgetId(child, `child_${index}`)}`);
      tab.children.forEach((child, index) => appendWidget(child, childIds[index] ?? `${tabRoot}_child_${index}`, components, dataModel, fallback));
      components.push({ id: tabRoot, component: "Column", children: childIds });
      return { title: tab.label, child: tabRoot };
    });
    components.push({ id, component: "Tabs", tabs });
  } else {
    components.push({ id, component: "Text", text: JSON.stringify(widget) });
  }
}

function appendForm(widget: FormWidget, id: string, components: A2UIComponent[], dataModel: Record<string, unknown>, fallback: string[]): void {
  const children: string[] = [];
  if (widget.title) {
    components.push({ id: `${id}_title`, component: "Text", text: widget.title });
    children.push(`${id}_title`);
  }
  if (widget.description) {
    components.push({ id: `${id}_description`, component: "Text", text: widget.description });
    children.push(`${id}_description`);
  }
  widget.fields.forEach((field, index) => {
    const fieldId = `${id}_${field.id}`;
    appendField(field, fieldId, components, dataModel);
    children.push(fieldId);
  });
  const actionsId = `${id}_actions`;
  const cancelLabelId = `${id}_cancel_label`;
  const submitLabelId = `${id}_submit_label`;
  components.push({ id: cancelLabelId, component: "Text", text: widget.cancelLabel ?? "Cancel" });
  components.push({ id: submitLabelId, component: "Text", text: widget.submitLabel ?? "Submit" });
  components.push({ id: `${id}_cancel`, component: "Button", child: cancelLabelId, action: { name: "click", payload: { id: `${widget.id}:cancel` } } });
  components.push({ id: `${id}_submit`, component: "Button", child: submitLabelId, variant: "primary", action: { name: "submit", payload: { id: widget.id, valuesPath: "/forms" } } });
  components.push({ id: actionsId, component: "Row", children: [`${id}_cancel`, `${id}_submit`] });
  children.push(actionsId);
  components.push({ id, component: "Column", children });
  fallback.push(`Form: ${widget.title ?? widget.id}`);
}

function appendField(field: FormField, id: string, components: A2UIComponent[], dataModel: Record<string, unknown>): void {
  const path = `/forms/${field.id}`;
  if (field.type === "checkbox") {
    setPath(dataModel, path, Boolean(field.checked));
    components.push({ id, component: "CheckBox", label: field.label, value: { path } });
  } else if (field.type === "select") {
    setPath(dataModel, path, field.value ? [field.value] : []);
    components.push({ id, component: "ChoicePicker", label: field.label, options: field.options, value: { path }, variant: "mutuallyExclusive", displayStyle: "chips" });
  } else {
    setPath(dataModel, path, field.value ?? "");
    components.push({ id, component: "TextField", label: field.label, value: { path }, placeholder: field.placeholder, variant: inputVariant(field.inputType) });
  }
}

function appendConfirmation(widget: ConfirmationWidget, id: string, components: A2UIComponent[], fallback: string[]): void {
  const children: string[] = [`${id}_title`];
  components.push({ id: `${id}_title`, component: "Text", text: widget.title });
  if (widget.message) {
    components.push({ id: `${id}_message`, component: "Text", text: widget.message });
    children.push(`${id}_message`);
  }
  components.push({ id: `${id}_cancel_label`, component: "Text", text: widget.cancelLabel ?? "Cancel" });
  components.push({ id: `${id}_confirm_label`, component: "Text", text: widget.confirmLabel ?? "Confirm" });
  components.push({ id: `${id}_cancel`, component: "Button", child: `${id}_cancel_label`, action: { name: "click", payload: { id: `${widget.id}:cancel` } } });
  components.push({ id: `${id}_confirm`, component: "Button", child: `${id}_confirm_label`, variant: "primary", action: { name: "click", payload: { id: `${widget.id}:confirm` } } });
  components.push({ id: `${id}_actions`, component: "Row", children: [`${id}_cancel`, `${id}_confirm`] });
  children.push(`${id}_actions`);
  components.push({ id, component: "Column", children });
  fallback.push(`Confirmation: ${widget.title}`);
}

function referencedChildren(component: A2UIComponent): string[] {
  if ("children" in component && Array.isArray(component.children)) return component.children;
  if ("child" in component && typeof component.child === "string") return [component.child];
  if (component.component === "Tabs") return component.tabs.map((tab) => tab.child);
  return [];
}

function widgetId(widget: Widget, fallback: string): string {
  return "id" in widget && typeof widget.id === "string" ? sanitizeId(widget.id) : sanitizeId(fallback);
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function inputVariant(inputType: string | undefined): "longText" | "number" | "shortText" | "obscured" {
  if (inputType === "number") return "number";
  if (inputType === "password") return "obscured";
  return "shortText";
}

function tableFallback(widget: TableWidget): string {
  return [widget.name, widget.columns.map((column) => column.label).join(" | "), ...widget.rows.map((row) => widget.columns.map((column) => String(row[column.key] ?? "")).join(" | "))].filter(Boolean).join("\n");
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split("/").filter(Boolean);
  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!isRecord(next)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  const key = parts.at(-1);
  if (key) cursor[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

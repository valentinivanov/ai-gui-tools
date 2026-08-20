import type {
  AgentUICapability,
  ConfirmationWidget,
  FormField,
  PlotPoint,
  PlotWidget,
  SelectOption,
  TableColumn,
  ToolDefinition,
  View,
  WasmAppletWidget,
  Widget
} from "./types.js";

export const defaultCapabilities: AgentUICapability[] = [
  "form",
  "choice",
  "table",
  "diff",
  "confirm",
  "container",
  "plot",
  "applet-pong",
  "view.replace"
];

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});

const optionSchema = objectSchema(
  {
    label: { type: "string" },
    value: { type: "string" }
  },
  ["label", "value"]
);

const pointSchema = objectSchema(
  {
    x: { type: "number" },
    y: { type: "number" }
  },
  ["x", "y"]
);

const fieldSchema = {
  anyOf: [
    objectSchema(
      {
        type: { const: "input" },
        id: { type: "string" },
        label: { type: "string" },
        inputType: { enum: ["text", "number", "password", "email"] },
        placeholder: { type: "string" },
        value: { anyOf: [{ type: "string" }, { type: "number" }] },
        required: { type: "boolean" }
      },
      ["type", "id", "label"]
    ),
    objectSchema(
      {
        type: { const: "checkbox" },
        id: { type: "string" },
        label: { type: "string" },
        checked: { type: "boolean" }
      },
      ["type", "id", "label"]
    ),
    objectSchema(
      {
        type: { const: "select" },
        id: { type: "string" },
        label: { type: "string" },
        options: { type: "array", items: optionSchema },
        value: { type: "string" },
        required: { type: "boolean" }
      },
      ["type", "id", "label", "options"]
    )
  ]
};

export function toolDefinitions(capabilities: AgentUICapability[]): ToolDefinition[] {
  const all: Record<AgentUICapability, ToolDefinition> = {
    form: {
      name: "ui.form",
      description: "Use when several related inputs or choices need to be collected from the user.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          fields: { type: "array", items: fieldSchema },
          submitLabel: { type: "string" },
          cancelLabel: { type: "string" }
        },
        ["viewId", "title", "fields"]
      )
    },
    choice: {
      name: "ui.choice",
      description: "Use when the user needs to choose one or more options before the task can continue.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          options: { type: "array", items: optionSchema },
          multiple: { type: "boolean" },
          submitLabel: { type: "string" },
          cancelLabel: { type: "string" }
        },
        ["viewId", "title", "options"]
      )
    },
    table: {
      name: "ui.table",
      description:
        "Use when structured records are easier to scan as rows and columns. Each column.key must exactly match a property name in every row object. Use name for the table caption row displayed above column headers. For submitted form values, prefer rows like { field: 'environment', value: 'staging' } with columns [{ key: 'field', label: 'Field' }, { key: 'value', label: 'Value' }]. If multiple tables must be shown together, use ui.container with several table widgets instead of calling ui.table repeatedly; each nested table should set name.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          name: { type: "string" },
          tableName: { type: "string" },
          columns: {
            type: "array",
            items: objectSchema({ key: { type: "string" }, label: { type: "string" } }, ["key", "label"])
          },
          rows: { type: "array", items: { type: "object" } }
        },
        ["viewId", "title", "columns", "rows"]
      )
    },
    diff: {
      name: "ui.diff",
      description: "Use when the user needs to review proposed text or code changes.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          files: {
            type: "array",
            items: objectSchema({
              path: { type: "string" },
              oldText: { type: "string" },
              newText: { type: "string" },
              patch: { type: "string" }
            }, ["path"])
          }
        },
        ["viewId", "title", "files"]
      )
    },
    confirm: {
      name: "ui.confirm",
      description: "Use when a consequential action requires explicit user approval.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          id: { type: "string" },
          title: { type: "string" },
          message: { type: "string" },
          confirmLabel: { type: "string" },
          cancelLabel: { type: "string" }
        },
        ["viewId", "id", "title"]
      )
    },
    plot: {
      name: "ui.plot",
      description:
        "Use to display numeric 2D data on an auto-ranged graph. Provide points as [{ x: number, y: number }]. mode='points' draws circles, mode='lines' connects consecutive points, and mode='bars' draws vertical bars from the X axis (y=0) to each point.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          id: { type: "string" },
          mode: { enum: ["points", "lines", "bars"] },
          points: { type: "array", items: pointSchema }
        },
        ["viewId", "title", "points"]
      )
    },
    applet: {
      name: "ui.applet",
      description:
        "Use only for custom spatial or stateful mini-applications that need executable local behavior beyond ordinary AgentUI widgets, such as small games, diagram canvases, simulations, drawing tools, node graphs, or timeline editors. Prefer text for explanations and declarative AgentUI widgets for normal forms, tables, choices, plots, diffs, and confirmations. Applets run locally; ordinary pointer, keyboard, and frame events do not go to the model. Only semantic applet events escape back to AgentUI.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          id: { type: "string" },
          module: objectSchema({
            name: { type: "string" },
            url: { type: "string" },
            hash: { type: "string" }
          }),
          width: { type: "number" },
          height: { type: "number" },
          capabilities: {
            type: "array",
            items: { enum: ["canvas", "pointer", "keyboard", "timer", "emit_event"] }
          },
          initialState: {}
        },
        ["viewId", "title", "id", "module", "capabilities"]
      )
    },
    "applet-pong": {
      name: "ui.applet-pong",
      description:
        "Open the prebuilt Pong WASM applet. Use only when the user explicitly asks to play or open the Pong game demo. This is not a generic applet loader; it always opens the bundled Pong applet.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          id: { type: "string" },
          width: { type: "number" },
          height: { type: "number" }
        },
        ["viewId", "title"]
      )
    },
    container: {
      name: "ui.container",
      description:
        "Use when multiple UI elements must be shown together in one response, such as three tables or a table plus explanatory text. Do not call ui.table repeatedly for a multi-table result; instead put all tables/widgets in this single container so the whole group is rendered as one current UI.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          children: {
            type: "array",
            items: { type: "object" },
            description:
              "Renderer-independent widget objects to render together. Examples include {type:'table', name:'Entered values', columns:[...], rows:[...]}, {type:'plot', title:'Latency', mode:'lines', points:[{x:1,y:20}]}, {type:'separator'} for a one-line-tall divider/spacer between controls, {type:'markdown', markdown:'...'}, {type:'form', id:'...', fields:[...]}, or nested {type:'container', children:[...]}. For table widgets inside a container, set table.name when the table needs a visible caption row."
          }
        },
        ["viewId", "title", "children"]
      )
    },
    "view.replace": {
      name: "ui.view.replace",
      description: "Replace a complete renderer-independent view. Use as an escape hatch for custom widget trees.",
      parameters: objectSchema({ view: { type: "object" } }, ["view"])
    }
  };

  return capabilities.map((capability) => all[capability]);
}

export function commandFromTool(name: string, args: unknown): { type: "replace_view"; view: View } {
  const data = asRecord(args);

  switch (name) {
    case "ui.form":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [
          {
            type: "form",
            id: `${stringValue(data.viewId, "viewId")}:form`,
            title: optionalString(data.title),
            description: optionalString(data.description),
            fields: arrayValue(data.fields, "fields") as FormField[],
            submitLabel: optionalString(data.submitLabel) ?? "Submit",
            cancelLabel: optionalString(data.cancelLabel) ?? "Cancel"
          }
        ]
      });
    case "ui.choice":
      return choiceCommand(data);
    case "ui.table":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [
          {
            type: "table",
            id: `${stringValue(data.viewId, "viewId")}:table`,
            name: optionalString(data.name) ?? optionalString(data.tableName),
            columns: arrayValue(data.columns, "columns") as TableColumn[],
            rows: arrayValue(data.rows, "rows") as Record<string, string | number | boolean | null | undefined>[]
          }
        ]
      });
    case "ui.diff":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [
          {
            type: "diff",
            id: `${stringValue(data.viewId, "viewId")}:diff`,
            files: arrayValue(data.files, "files") as never
          }
        ]
      });
    case "ui.confirm":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [confirmationWidget(data)]
      });
    case "ui.plot":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [plotWidget(data)]
      });
    case "ui.applet":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [appletWidget(data)]
      });
    case "ui.applet-pong":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [pongAppletWidget(data)]
      });
    case "ui.container":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [
          {
            type: "container",
            id: `${stringValue(data.viewId, "viewId")}:container`,
            title: optionalString(data.title),
            children: arrayValue(data.children, "children") as Widget[]
          }
        ]
      });
    case "ui.view.replace":
      return replaceView(data.view as View);
    default:
      throw new Error(`Unknown AgentUI tool: ${name}`);
  }
}

function choiceCommand(data: Record<string, unknown>): { type: "replace_view"; view: View } {
  const viewId = stringValue(data.viewId, "viewId");
  const options = arrayValue(data.options, "options") as SelectOption[];
  const multiple = Boolean(data.multiple);
  const fields: FormField[] = multiple
    ? options.map((option) => ({
        type: "checkbox",
        id: `${viewId}:choice:${option.value}`,
        label: option.label
      }))
    : [
        {
          type: "select",
          id: `${viewId}:choice`,
          label: "Choice",
          options
        }
      ];

  return replaceView({
    id: viewId,
    title: optionalString(data.title),
    children: [
      ...(data.description ? [{ type: "markdown" as const, markdown: stringValue(data.description, "description") }] : []),
      {
        type: "form",
        id: `${viewId}:form`,
        fields,
        submitLabel: optionalString(data.submitLabel) ?? "Continue",
        cancelLabel: optionalString(data.cancelLabel) ?? "Cancel"
      }
    ]
  });
}

function confirmationWidget(data: Record<string, unknown>): ConfirmationWidget {
  return {
    type: "confirmation",
    id: stringValue(data.id, "id"),
    title: stringValue(data.title, "title"),
    message: optionalString(data.message),
    confirmLabel: optionalString(data.confirmLabel) ?? "Confirm",
    cancelLabel: optionalString(data.cancelLabel) ?? "Cancel"
  };
}

function plotWidget(data: Record<string, unknown>): PlotWidget {
  return {
    type: "plot",
    id: optionalString(data.id) ?? `${stringValue(data.viewId, "viewId")}:plot`,
    title: optionalString(data.title),
    mode: plotMode(data.mode),
    points: arrayValue(data.points, "points").map(pointValue)
  };
}

function appletWidget(data: Record<string, unknown>): WasmAppletWidget {
  const module = asRecord(data.module);
  return {
    type: "wasm-applet",
    id: stringValue(data.id, "id"),
    module: {
      name: optionalString(module.name),
      url: optionalString(module.url),
      hash: optionalString(module.hash)
    },
    width: optionalNumber(data.width),
    height: optionalNumber(data.height),
    capabilities: arrayValue(data.capabilities, "capabilities").map(appletCapability),
    initialState: data.initialState
  };
}

function pongAppletWidget(data: Record<string, unknown>): WasmAppletWidget {
  return {
    type: "wasm-applet",
    id: optionalString(data.id) ?? `${stringValue(data.viewId, "viewId")}:pong`,
    module: { name: "pong" },
    width: optionalNumber(data.width) ?? 640,
    height: optionalNumber(data.height) ?? 360,
    capabilities: ["canvas", "keyboard", "pointer", "timer", "emit_event"]
  };
}

function appletCapability(value: unknown): WasmAppletWidget["capabilities"][number] {
  if (value === "canvas" || value === "pointer" || value === "keyboard" || value === "timer" || value === "emit_event") return value;
  throw new Error(`Unsupported applet capability: ${String(value)}`);
}

function pointValue(value: unknown): PlotPoint {
  const data = asRecord(value);
  return {
    x: numberValue(data.x, "point.x"),
    y: numberValue(data.y, "point.y")
  };
}

function plotMode(value: unknown): PlotWidget["mode"] {
  return value === "lines" || value === "bars" || value === "points" ? value : "points";
}

function replaceView(view: View): { type: "replace_view"; view: View } {
  return { type: "replace_view", view };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${name} to be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${name} to be a number`);
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayValue(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${name} to be an array`);
  }
  return value;
}

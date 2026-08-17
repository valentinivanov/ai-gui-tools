import type {
  AgentUICapability,
  ConfirmationWidget,
  FormField,
  ProgressWidget,
  SelectOption,
  TableColumn,
  ToolDefinition,
  View,
  Widget
} from "./types.js";

export const defaultCapabilities: AgentUICapability[] = [
  "form",
  "choice",
  "table",
  "compare",
  "diff",
  "confirm",
  "progress",
  "container",
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
    compare: {
      name: "ui.compare",
      description: "Use when the user needs to compare alternatives across multiple criteria.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          items: { type: "array", items: { type: "string" } },
          criteria: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "object" } }
        },
        ["viewId", "title", "items", "criteria"]
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
    progress: {
      name: "ui.progress",
      description: "Use to show progress for a long-running task without calling the model for every frame.",
      parameters: objectSchema(
        {
          viewId: { type: "string" },
          title: { type: "string" },
          id: { type: "string" },
          label: { type: "string" },
          value: { type: "number" },
          max: { type: "number" },
          status: { type: "string" }
        },
        ["viewId", "title", "id", "value"]
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
              "Renderer-independent widget objects to render together. Examples include {type:'table', name:'Entered values', columns:[...], rows:[...]}, {type:'separator'} for a one-line-tall divider/spacer between controls, {type:'markdown', markdown:'...'}, {type:'form', id:'...', fields:[...]}, or nested {type:'container', children:[...]}. For table widgets inside a container, set table.name when the table needs a visible caption row."
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
    case "ui.compare":
      return compareCommand(data);
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
    case "ui.progress":
      return replaceView({
        id: stringValue(data.viewId, "viewId"),
        title: optionalString(data.title),
        children: [progressWidget(data)]
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

function compareCommand(data: Record<string, unknown>): { type: "replace_view"; view: View } {
  const items = arrayValue(data.items, "items") as string[];
  const criteria = arrayValue(data.criteria, "criteria") as string[];
  const columns = [
    { key: "item", label: "Option" },
    ...criteria.map((criterion) => ({ key: criterion, label: criterion }))
  ];
  const rows =
    Array.isArray(data.rows) && data.rows.length > 0
      ? (data.rows as Record<string, string | number | boolean | null | undefined>[])
      : items.map((item) => ({ item }));

  return replaceView({
    id: stringValue(data.viewId, "viewId"),
    title: optionalString(data.title),
    children: [
      {
        type: "table",
        id: `${stringValue(data.viewId, "viewId")}:compare`,
        columns,
        rows
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

function progressWidget(data: Record<string, unknown>): ProgressWidget {
  return {
    type: "progress",
    id: stringValue(data.id, "id"),
    label: optionalString(data.label),
    value: numberValue(data.value, "value"),
    max: typeof data.max === "number" ? data.max : 100,
    status: optionalString(data.status)
  };
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

function arrayValue(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${name} to be an array`);
  }
  return value;
}

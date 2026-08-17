export type AgentUICapability =
  | "form"
  | "choice"
  | "table"
  | "compare"
  | "diff"
  | "confirm"
  | "progress"
  | "container"
  | "view.replace";

export interface AgentUIOptions {
  capabilities?: AgentUICapability[];
}

export interface AgentUIState {
  views: View[];
}

export interface View {
  id: string;
  title?: string | undefined;
  children: Widget[];
}

export type Widget =
  | TextWidget
  | MarkdownWidget
  | ButtonWidget
  | CheckboxWidget
  | SelectWidget
  | InputWidget
  | FormWidget
  | ContainerWidget
  | SeparatorWidget
  | TableWidget
  | TreeWidget
  | TabsWidget
  | ProgressWidget
  | DiffWidget
  | ConfirmationWidget;

export interface TextWidget {
  type: "text";
  text: string;
}

export interface MarkdownWidget {
  type: "markdown";
  markdown: string;
}

export interface ButtonWidget {
  type: "button";
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "danger" | undefined;
}

export interface CheckboxWidget {
  type: "checkbox";
  id: string;
  label: string;
  checked?: boolean | undefined;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectWidget {
  type: "select";
  id: string;
  label?: string | undefined;
  options: SelectOption[];
  value?: string | undefined;
}

export interface InputWidget {
  type: "input";
  id: string;
  label?: string | undefined;
  inputType?: "text" | "number" | "password" | "email" | undefined;
  placeholder?: string | undefined;
  value?: string | number | undefined;
}

export type FormField =
  | {
      type: "input";
      id: string;
      label: string;
      inputType?: InputWidget["inputType"] | undefined;
      placeholder?: string | undefined;
      value?: string | number | undefined;
      required?: boolean | undefined;
    }
  | {
      type: "checkbox";
      id: string;
      label: string;
      checked?: boolean | undefined;
    }
  | {
      type: "select";
      id: string;
      label: string;
      options: SelectOption[];
      value?: string | undefined;
      required?: boolean | undefined;
    };

export interface FormWidget {
  type: "form";
  id: string;
  title?: string | undefined;
  description?: string | undefined;
  fields: FormField[];
  submitLabel?: string | undefined;
  cancelLabel?: string | undefined;
}

export interface ContainerWidget {
  type: "container";
  id?: string | undefined;
  title?: string | undefined;
  children: Widget[];
}

export interface SeparatorWidget {
  type: "separator";
  id?: string | undefined;
}

export interface TableColumn {
  key: string;
  label: string;
}

export interface TableWidget {
  type: "table";
  id?: string | undefined;
  name?: string | undefined;
  columns: TableColumn[];
  rows: Record<string, string | number | boolean | null | undefined>[];
}

export interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[] | undefined;
}

export interface TreeWidget {
  type: "tree";
  id?: string | undefined;
  nodes: TreeNode[];
}

export interface TabsWidget {
  type: "tabs";
  id: string;
  tabs: Array<{
    id: string;
    label: string;
    children: Widget[];
  }>;
  activeTabId?: string | undefined;
}

export interface ProgressWidget {
  type: "progress";
  id: string;
  label?: string | undefined;
  value: number;
  max?: number | undefined;
  status?: string | undefined;
}

export interface DiffFile {
  path: string;
  oldText?: string | undefined;
  newText?: string | undefined;
  patch?: string | undefined;
}

export interface DiffWidget {
  type: "diff";
  id: string;
  files: DiffFile[];
}

export interface ConfirmationWidget {
  type: "confirmation";
  id: string;
  title: string;
  message?: string | undefined;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
}

export type UIEvent =
  | { type: "click"; id: string }
  | { type: "change"; id: string; value: unknown }
  | { type: "submit"; id: string; values: Record<string, unknown> };

export type UIEventPolicy = "local" | "model";

export type AgentUICommand =
  | { type: "replace_view"; view: View }
  | { type: "close_view"; id: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  content: string;
  state?: AgentUIState;
}

export interface ToolProvider {
  definitions(): ToolDefinition[];
  invoke(name: string, args: unknown): Promise<ToolResult>;
}

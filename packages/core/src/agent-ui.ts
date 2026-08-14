import { agentUIInstructions } from "./instructions.js";
import { commandFromTool, defaultCapabilities, toolDefinitions } from "./tools.js";
import type {
  AgentUICapability,
  AgentUICommand,
  AgentUIOptions,
  AgentUIState,
  ToolProvider,
  ToolResult,
  UIEvent,
  View,
  Widget
} from "./types.js";

type StateListener = (state: AgentUIState) => void;
type EventListener = (event: UIEvent, state: AgentUIState) => void;

export interface AgentUI {
  readonly instructions: string;
  readonly toolProvider: ToolProvider;
  getState(): AgentUIState;
  subscribe(listener: StateListener): () => void;
  subscribeEvents(listener: EventListener): () => void;
  dispatch(command: AgentUICommand): AgentUIState;
  handleToolCall(name: string, args: unknown): Promise<ToolResult>;
  handleEvent(event: UIEvent): UIEvent;
  clear(): void;
}

export function createAgentUI(options: AgentUIOptions = {}): AgentUI {
  const capabilities = options.capabilities ?? defaultCapabilities;
  return new AgentUIStore(capabilities);
}

class AgentUIStore implements AgentUI {
  readonly instructions = agentUIInstructions;
  readonly toolProvider: ToolProvider;

  #state: AgentUIState = { views: [] };
  #stateListeners = new Set<StateListener>();
  #eventListeners = new Set<EventListener>();

  constructor(capabilities: AgentUICapability[]) {
    this.toolProvider = {
      definitions: () => toolDefinitions(capabilities),
      invoke: (name, args) => this.handleToolCall(name, args)
    };
  }

  getState(): AgentUIState {
    return this.#state;
  }

  subscribe(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  subscribeEvents(listener: EventListener): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  dispatch(command: AgentUICommand): AgentUIState {
    if (command.type === "replace_view") {
      const nextView = preserveValues(this.#state.views.find((view) => view.id === command.view.id), command.view);
      const existingIndex = this.#state.views.findIndex((view) => view.id === command.view.id);
      const views =
        existingIndex >= 0
          ? this.#state.views.map((view, index) => (index === existingIndex ? nextView : view))
          : [...this.#state.views, nextView];
      this.#state = { views };
    } else {
      this.#state = { views: this.#state.views.filter((view) => view.id !== command.id) };
    }

    this.#emitState();
    return this.#state;
  }

  async handleToolCall(name: string, args: unknown): Promise<ToolResult> {
    try {
      const command = commandFromTool(name, args);
      this.dispatch(command);
      return {
        ok: true,
        content: `AgentUI handled ${name}. The renderer-independent UI state was updated.`,
        state: this.#state
      };
    } catch (error) {
      return {
        ok: false,
        content: error instanceof Error ? error.message : "Unknown AgentUI tool error"
      };
    }
  }

  handleEvent(event: UIEvent): UIEvent {
    this.#state = applyEventToState(this.#state, event);
    this.#emitState();
    for (const listener of this.#eventListeners) {
      listener(event, this.#state);
    }
    return event;
  }

  clear(): void {
    this.#state = { views: [] };
    this.#emitState();
  }

  #emitState(): void {
    for (const listener of this.#stateListeners) {
      listener(this.#state);
    }
  }
}

function preserveValues(previous: View | undefined, next: View): View {
  if (!previous) {
    return next;
  }
  const values = collectValues(previous.children);
  return {
    ...next,
    children: next.children.map((widget) => restoreWidgetValue(widget, values))
  };
}

function collectValues(widgets: Widget[]): Map<string, unknown> {
  const values = new Map<string, unknown>();
  for (const widget of widgets) {
    if (widget.type === "checkbox") values.set(widget.id, widget.checked);
    if (widget.type === "input") values.set(widget.id, widget.value);
    if (widget.type === "select") values.set(widget.id, widget.value);
    if (widget.type === "tabs") {
      values.set(widget.id, widget.activeTabId);
      for (const tab of widget.tabs) {
        for (const [key, value] of collectValues(tab.children)) values.set(key, value);
      }
    }
    if (widget.type === "form") {
      for (const field of widget.fields) {
        if (field.type === "checkbox") values.set(field.id, field.checked);
        if (field.type === "input") values.set(field.id, field.value);
        if (field.type === "select") values.set(field.id, field.value);
      }
    }
  }
  return values;
}

function restoreWidgetValue(widget: Widget, values: Map<string, unknown>): Widget {
  if (widget.type === "checkbox" && widget.checked === undefined && values.has(widget.id)) {
    return { ...widget, checked: Boolean(values.get(widget.id)) };
  }
  if (widget.type === "input" && widget.value === undefined && values.has(widget.id)) {
    const value = values.get(widget.id);
    return typeof value === "string" || typeof value === "number" ? { ...widget, value } : widget;
  }
  if (widget.type === "select" && widget.value === undefined && values.has(widget.id)) {
    const value = values.get(widget.id);
    return typeof value === "string" ? { ...widget, value } : widget;
  }
  if (widget.type === "tabs") {
    return {
      ...widget,
      activeTabId: widget.activeTabId ?? (typeof values.get(widget.id) === "string" ? String(values.get(widget.id)) : undefined),
      tabs: widget.tabs.map((tab) => ({
        ...tab,
        children: tab.children.map((child) => restoreWidgetValue(child, values))
      }))
    };
  }
  if (widget.type === "form") {
    return {
      ...widget,
      fields: widget.fields.map((field) => {
        if (!values.has(field.id)) return field;
        const value = values.get(field.id);
        if (field.type === "checkbox" && field.checked === undefined) return { ...field, checked: Boolean(value) };
        if (field.type === "input" && field.value === undefined && (typeof value === "string" || typeof value === "number")) {
          return { ...field, value };
        }
        if (field.type === "select" && field.value === undefined && typeof value === "string") return { ...field, value };
        return field;
      })
    };
  }
  return widget;
}

function applyEventToState(state: AgentUIState, event: UIEvent): AgentUIState {
  if (event.type === "click") {
    return state;
  }

  return {
    views: state.views.map((view) => ({
      ...view,
      children: view.children.map((widget) => applyEventToWidget(widget, event))
    }))
  };
}

function applyEventToWidget(widget: Widget, event: Extract<UIEvent, { type: "change" | "submit" }>): Widget {
  if (event.type === "change") {
    if (widget.type === "checkbox" && widget.id === event.id) return { ...widget, checked: Boolean(event.value) };
    if (widget.type === "input" && widget.id === event.id && (typeof event.value === "string" || typeof event.value === "number")) {
      return { ...widget, value: event.value };
    }
    if (widget.type === "select" && widget.id === event.id && typeof event.value === "string") return { ...widget, value: event.value };
    if (widget.type === "tabs" && widget.id === event.id && typeof event.value === "string") return { ...widget, activeTabId: event.value };
  }

  if (widget.type === "form") {
    const submittedValues = event.type === "submit" && widget.id === event.id ? event.values : undefined;
    return {
      ...widget,
      fields: widget.fields.map((field) => {
        const nextValue = event.type === "change" && field.id === event.id ? event.value : submittedValues?.[field.id];
        if (nextValue === undefined) return field;
        if (field.type === "checkbox") return { ...field, checked: Boolean(nextValue) };
        if (field.type === "input" && (typeof nextValue === "string" || typeof nextValue === "number")) return { ...field, value: nextValue };
        if (field.type === "select" && typeof nextValue === "string") return { ...field, value: nextValue };
        return field;
      })
    };
  }

  if (widget.type === "tabs") {
    return {
      ...widget,
      tabs: widget.tabs.map((tab) => ({
        ...tab,
        children: tab.children.map((child) => applyEventToWidget(child, event))
      }))
    };
  }

  return widget;
}

import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const defaultAgentUIResourceUri = "ui://agentui/view/v1";
export const agentUIAppVersion = "20260817095152";

export function registerAgentUIAppResource(server: Pick<McpServer, "registerResource">, resourceUri = defaultAgentUIResourceUri): void {
  registerAppResource(
    server,
    "AgentUI Renderer",
    resourceUri,
    {
      description: "Renderer-independent AgentUI view shell."
    },
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: agentUIAppHtml(),
          _meta: {
            ui: {
              prefersBorder: true
            }
          }
        }
      ]
    })
  );
}

export function agentUIAppHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color: #1b1f24; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 14px; background: #fff; }
    .agentui { display: grid; gap: 12px; }
    .version { color: #6b7280; font-size: 11px; line-height: 1; text-align: right; }
    .meta { display: flex; justify-content: space-between; gap: 8px; color: #6b7280; font-size: 11px; line-height: 1; margin-bottom: 8px; }
    .readonly-badge { color: #92400e; font-weight: 650; }
    .view { border: 1px solid #d7dce2; border-radius: 8px; padding: 14px; background: #fff; }
    .view.readonly { background: #fbfbfa; }
    h2, h3, p { margin-top: 0; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    h3 { font-size: 15px; margin-bottom: 8px; }
    .stack, form { display: grid; gap: 10px; }
    .container { display: grid; gap: 12px; }
    .container-title { margin: 0; font-size: 14px; font-weight: 700; }
    .separator { display: flex; align-items: center; min-height: 1lh; }
    .separator::before { content: ""; display: block; width: 100%; border-top: 1px solid #d7dce2; }
    label.field { display: grid; gap: 5px; font-size: 13px; font-weight: 650; }
    input, select, button { font: inherit; }
    input, select { box-sizing: border-box; width: 100%; border: 1px solid #c9d1da; border-radius: 6px; padding: 8px 9px; }
    label.check { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button { border: 1px solid #b9c2cc; border-radius: 6px; padding: 8px 11px; background: #f7f9fb; cursor: pointer; font-weight: 650; }
    button.primary { border-color: #166534; color: #fff; background: #15803d; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e2e7ed; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f7f9fb; }
    th.table-name { background: #e9eef4; color: #1f2937; font-weight: 750; text-align: left; }
    pre { overflow: auto; margin: 0; padding: 10px; background: #f7f9fb; border: 1px solid #e2e7ed; border-radius: 6px; }
    .empty { color: #596574; border: 1px dashed #b9c2cc; border-radius: 8px; padding: 18px; text-align: center; }
  </style>
</head>
<body>
  <div class="meta"><span id="sequence"></span><span class="version">AgentUI ${agentUIAppVersion}</span></div>
  <div id="root" class="agentui"><div class="empty">Waiting for AgentUI state.</div></div>
  <script>
    const root = document.getElementById("root");
    const sequence = document.getElementById("sequence");
    let state = null;
    let hostContext = {};
    let frameUiSequence = null;
    let latestUiSequence = null;
    let contextSequence = null;
    let readOnly = false;
    let syncInFlight = false;
    let nextRequestId = 1;
    const pendingRequests = new Map();

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;

      if (message.id !== undefined && pendingRequests.has(message.id)) {
        const pending = pendingRequests.get(message.id);
        pendingRequests.delete(message.id);
        if (message.error) pending.reject(message.error);
        else pending.resolve(message.result);
        return;
      }

      if (message.method === "ui/notifications/tool-input") {
        applyToolInput(message.params);
        return;
      }

      if (message.method === "ui/notifications/tool-result") {
        applyToolResult(message.params);
      }
    }, { passive: true });

    connect().catch((error) => {
      root.innerHTML = '<div class="empty">AgentUI failed to initialize: ' + escapeHtml(String(error?.message ?? error)) + '</div>';
    });

    function sendEvent(event) {
      void request("tools/call", { name: "ui_event", arguments: { event, uiSequence: frameUiSequence } });
      if (event.type === "submit" || event.id.endsWith(":cancel") || event.id.endsWith(":confirm")) {
        if (event.type === "submit") applySubmittedValues(event);
        readOnly = true;
        render();
        void updateModelContext(event);
      }
    }
    async function connect() {
      const init = await request("ui/initialize", {
        appInfo: { name: "AgentUI Renderer", version: "0.0.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26"
      });
      hostContext = init?.hostContext ?? {};
      notify("ui/notifications/initialized", {});
      readOpenAICompatibilityState();
      reportSize();
      new ResizeObserver(reportSize).observe(document.documentElement);
    }
    function request(method, params) {
      const id = nextRequestId++;
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      return new Promise((resolve, reject) => pendingRequests.set(id, { resolve, reject }));
    }
    function notify(method, params) {
      window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
    }
    async function updateModelContext(event) {
      await request("ui/update-model-context", {
        structuredContent: {
          agentuiEvent: event
        }
      });
    }
    function applyToolInput(params) {
      const nextState = extractState(params?.arguments);
      applySequences(params?.arguments);
      if (nextState) {
        state = nextState;
        updateReadOnly();
        render();
        void reconcileWithServerState();
      }
    }
    function applyToolResult(params) {
      const payload = params?.structuredContent ?? params;
      const nextState = extractState(payload);
      applySequences(payload);
      if (nextState) {
        state = nextState;
        updateReadOnly();
        render();
        void reconcileWithServerState();
      }
    }
    function extractState(value) {
      return value?.state ?? value?.result?.state ?? value?.structuredContent?.state ?? value?.structuredContent?.result?.state ?? null;
    }
    function extractUiSequence(value) {
      const valueSequence = value?.agentuiUiSequence ?? value?.result?.agentuiUiSequence ?? value?.structuredContent?.agentuiUiSequence ?? value?.structuredContent?.result?.agentuiUiSequence;
      return typeof valueSequence === "number" ? valueSequence : null;
    }
    function extractContextSequence(value) {
      const valueSequence = value?.agentuiContextSequence ?? value?.result?.agentuiContextSequence ?? value?.structuredContent?.agentuiContextSequence ?? value?.structuredContent?.result?.agentuiContextSequence;
      return typeof valueSequence === "number" ? valueSequence : extractUiSequence(value);
    }
    function applySequences(value) {
      const uiSequence = extractUiSequence(value);
      const nextContextSequence = extractContextSequence(value);
      if (uiSequence !== null) {
        frameUiSequence ??= uiSequence;
        latestUiSequence = Math.max(latestUiSequence ?? uiSequence, uiSequence);
      }
      if (nextContextSequence !== null) {
        contextSequence = Math.max(contextSequence ?? nextContextSequence, nextContextSequence);
      }
      updateReadOnly();
    }
    function updateReadOnly() {
      const staleByUi = frameUiSequence !== null && latestUiSequence !== null && latestUiSequence > frameUiSequence;
      const staleByContext = frameUiSequence !== null && contextSequence !== null && contextSequence > frameUiSequence;
      readOnly = readOnly || staleByUi || staleByContext;
    }
    function readOpenAICompatibilityState() {
      const openai = window.openai;
      const outputState = extractState(openai?.toolOutput);
      const inputState = extractState(openai?.toolInput);
      applySequences(openai?.toolOutput);
      applySequences(openai?.toolInput);
      if (outputState || inputState) {
        state = outputState ?? inputState;
        updateReadOnly();
        render();
        void reconcileWithServerState();
      }
    }
    async function reconcileWithServerState() {
      if (syncInFlight || !state?.views?.length) return;
      syncInFlight = true;
      try {
        const output = await request("tools/call", { name: "ui_state", arguments: {} });
        const payload = output?.structuredContent ?? output;
        const currentUiSequence = extractUiSequence(payload);
        const currentContextSequence = extractContextSequence(payload);
        if (currentUiSequence !== null) latestUiSequence = currentUiSequence;
        if (currentContextSequence !== null) contextSequence = currentContextSequence;
        applyCompletedEvent(payload);
        updateReadOnly();
        render();
      } catch {
        // Older hosts may not proxy app-only state checks; replayed tool metadata remains the fallback.
      } finally {
        syncInFlight = false;
      }
    }
    function reportSize() {
      const rect = document.documentElement.getBoundingClientRect();
      notify("ui/notifications/size-changed", {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      });
    }
    function render() {
      const views = state?.views ?? [];
      sequence.textContent = sequenceText();
      if (views.length === 0) {
        root.innerHTML = '<div class="empty">No active AgentUI view.</div>';
        reportSize();
        return;
      }
      root.replaceChildren(...views.map(renderView));
      reportSize();
    }
    function renderView(view) {
      const section = el("section", readOnly ? "view readonly" : "view");
      if (view.title) section.append(el("h2", "", view.title));
      if (readOnly) section.append(el("div", "readonly-badge", "Read-only previous UI"));
      const stack = el("div", "stack");
      for (const widget of view.children ?? []) stack.append(renderWidget(widget));
      section.append(stack);
      return section;
    }
    function renderWidget(widget) {
      if (widget.type === "text") return el("p", "", widget.text);
      if (widget.type === "markdown") return el("p", "", widget.markdown);
      if (widget.type === "container") return renderContainer(widget);
      if (widget.type === "separator") return el("div", "separator");
      if (widget.type === "table") return renderTable(widget);
      if (widget.type === "diff") return renderDiff(widget);
      if (widget.type === "confirmation") return renderConfirmation(widget);
      if (widget.type === "form") return renderForm(widget);
      if (widget.type === "progress") {
        const wrap = el("div", "stack");
        if (widget.label) wrap.append(el("strong", "", widget.label));
        const progress = document.createElement("progress");
        progress.value = widget.value ?? 0;
        progress.max = widget.max ?? 100;
        wrap.append(progress);
        if (widget.status) wrap.append(el("small", "", widget.status));
        return wrap;
      }
      return el("pre", "", JSON.stringify(widget, null, 2));
    }
    function renderContainer(widget) {
      const wrap = el("div", "container");
      if (widget.title) wrap.append(el("h3", "container-title", widget.title));
      for (const child of widget.children ?? []) wrap.append(renderWidget(child));
      return wrap;
    }
    function renderForm(widget) {
      const form = document.createElement("form");
      if (widget.title) form.append(el("h3", "", widget.title));
      if (widget.description) form.append(el("p", "", widget.description));
      for (const field of widget.fields ?? []) form.append(renderField(field));
      const actions = el("div", "actions");
      const cancel = el("button", "", widget.cancelLabel ?? "Cancel");
      cancel.type = "button";
      cancel.disabled = readOnly;
      cancel.onclick = () => sendEvent({ type: "click", id: widget.id + ":cancel" });
      const submit = el("button", "primary", widget.submitLabel ?? "Submit");
      submit.type = "submit";
      submit.disabled = readOnly;
      actions.append(cancel, submit);
      form.append(actions);
      form.onsubmit = (event) => {
        event.preventDefault();
        if (readOnly) return;
        const values = {};
        for (const field of widget.fields ?? []) {
          const input = form.querySelector("[name='" + cssEscape(field.id) + "']");
          values[field.id] = input?.type === "checkbox" ? input.checked : input?.value ?? "";
        }
        sendEvent({ type: "submit", id: widget.id, values });
      };
      return form;
    }
    function renderField(field) {
      if (field.type === "checkbox") {
        const label = el("label", "check");
        const input = document.createElement("input");
        input.type = "checkbox"; input.name = field.id; input.checked = Boolean(field.checked); input.disabled = readOnly;
        input.onchange = () => sendEvent({ type: "change", id: field.id, value: input.checked });
        label.append(input, document.createTextNode(field.label));
        return label;
      }
      const label = el("label", "field");
      label.append(el("span", "", field.label));
      const input = field.type === "select" ? document.createElement("select") : document.createElement("input");
      input.name = field.id;
      input.disabled = readOnly;
      if (field.type === "input") input.type = field.inputType ?? "text";
      if (field.type === "select") {
        for (const option of field.options ?? []) {
          const opt = document.createElement("option"); opt.value = option.value; opt.textContent = option.label; input.append(opt);
        }
      }
      input.value = field.value ?? "";
      input.onchange = () => sendEvent({ type: "change", id: field.id, value: input.type === "number" ? Number(input.value) : input.value });
      label.append(input);
      return label;
    }
    function renderTable(widget) {
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const tableName = tableDisplayName(widget);
      if (tableName) {
        const nameRow = document.createElement("tr");
        const nameCell = el("th", "table-name", tableName);
        nameCell.colSpan = Math.max((widget.columns ?? []).length, 1);
        nameRow.append(nameCell);
        thead.append(nameRow);
      }
      const hrow = document.createElement("tr");
      for (const column of widget.columns ?? []) hrow.append(el("th", "", column.label));
      thead.append(hrow); table.append(thead);
      const tbody = document.createElement("tbody");
      for (const row of widget.rows ?? []) {
        const tr = document.createElement("tr");
        for (const [columnIndex, column] of (widget.columns ?? []).entries()) tr.append(el("td", "", formatCellValue(cellValue(row, column, columnIndex))));
        tbody.append(tr);
      }
      table.append(tbody);
      return table;
    }
    function cellValue(row, column, columnIndex) {
      if (Array.isArray(row)) return row[columnIndex];
      if (!row || typeof row !== "object") return columnIndex === 0 ? row : undefined;
      if (row[column.key] !== undefined) return row[column.key];
      if (row[column.label] !== undefined) return row[column.label];
      const match = Object.keys(row).find((key) => key.toLowerCase() === String(column.key).toLowerCase() || key.toLowerCase() === String(column.label).toLowerCase());
      if (match) return row[match];
      return Object.values(row)[columnIndex];
    }
    function formatCellValue(value) {
      if (value === undefined || value === null) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }
    function tableDisplayName(widget) {
      return typeof widget.name === "string" && widget.name.length > 0
        ? widget.name
        : typeof widget.tableName === "string" && widget.tableName.length > 0
          ? widget.tableName
          : typeof widget.title === "string" && widget.title.length > 0
            ? widget.title
            : typeof widget.caption === "string" && widget.caption.length > 0
              ? widget.caption
              : "";
    }
    function renderDiff(widget) {
      const wrap = el("div", "stack");
      for (const file of widget.files ?? []) {
        const details = document.createElement("details"); details.open = true;
        details.append(el("summary", "", file.path), el("pre", "", file.patch ?? ["--- before", file.oldText ?? "", "+++ after", file.newText ?? ""].join("\\n")));
        wrap.append(details);
      }
      return wrap;
    }
    function renderConfirmation(widget) {
      const wrap = el("div", "stack");
      wrap.append(el("h3", "", widget.title));
      if (widget.message) wrap.append(el("p", "", widget.message));
      const actions = el("div", "actions");
      const cancel = el("button", "", widget.cancelLabel ?? "Cancel");
      cancel.disabled = readOnly;
      cancel.onclick = () => sendEvent({ type: "click", id: widget.id + ":cancel" });
      const confirm = el("button", "primary", widget.confirmLabel ?? "Confirm");
      confirm.disabled = readOnly;
      confirm.onclick = () => sendEvent({ type: "click", id: widget.id + ":confirm" });
      actions.append(cancel, confirm); wrap.append(actions);
      return wrap;
    }
    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function cssEscape(value) {
      return String(value).replace(/['\\\\]/g, "\\\\$&");
    }
    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
    function sequenceText() {
      const parts = [];
      if (frameUiSequence !== null) parts.push("ui #" + frameUiSequence);
      if (contextSequence !== null) parts.push("ctx #" + contextSequence);
      if (latestUiSequence !== null) parts.push("latest #" + latestUiSequence);
      if (readOnly) parts.push("read-only");
      return parts.join(" | ");
    }
    function applySubmittedValues(event) {
      state = {
        views: (state?.views ?? []).map((view) => ({
          ...view,
          children: view.children.map((widget) => applySubmittedValuesToWidget(widget, event))
        }))
      };
    }
    function applySubmittedValuesToWidget(widget, event) {
      if (widget.type === "form" && widget.id === event.id) {
        return {
          ...widget,
          fields: widget.fields.map((field) => {
            const value = event.values[field.id];
            if (value === undefined) return field;
            if (field.type === "checkbox") return { ...field, checked: Boolean(value) };
            if (field.type === "input" && (typeof value === "string" || typeof value === "number")) return { ...field, value };
            if (field.type === "select" && typeof value === "string") return { ...field, value };
            return field;
          })
        };
      }
      if (widget.type === "tabs") {
        return {
          ...widget,
          tabs: widget.tabs.map((tab) => ({
            ...tab,
            children: tab.children.map((child) => applySubmittedValuesToWidget(child, event))
          }))
        };
      }
      if (widget.type === "container") {
        return {
          ...widget,
          children: (widget.children ?? []).map((child) => applySubmittedValuesToWidget(child, event))
        };
      }
      return widget;
    }
    function applyCompletedEvent(payload) {
      if (frameUiSequence === null) return;
      const events = payload?.agentuiCompletedEvents ?? payload?.result?.agentuiCompletedEvents ?? payload?.structuredContent?.agentuiCompletedEvents;
      const event = events?.[String(frameUiSequence)] ?? events?.[frameUiSequence];
      if (!event) return;
      if (event.type === "submit") applySubmittedValues(event);
      readOnly = true;
    }
  </script>
</body>
</html>`;
}

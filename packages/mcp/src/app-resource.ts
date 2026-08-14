import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const defaultAgentUIResourceUri = "ui://agentui/view/v1";

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
          text: agentUIAppHtml()
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
    .view { border: 1px solid #d7dce2; border-radius: 8px; padding: 14px; background: #fff; }
    h2, h3, p { margin-top: 0; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    h3 { font-size: 15px; margin-bottom: 8px; }
    .stack, form { display: grid; gap: 10px; }
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
    pre { overflow: auto; margin: 0; padding: 10px; background: #f7f9fb; border: 1px solid #e2e7ed; border-radius: 6px; }
    .empty { color: #596574; border: 1px dashed #b9c2cc; border-radius: 8px; padding: 18px; text-align: center; }
  </style>
</head>
<body>
  <div id="root" class="agentui"><div class="empty">Waiting for AgentUI state.</div></div>
  <script type="module">
    import { App, PostMessageTransport } from "https://esm.sh/@modelcontextprotocol/ext-apps@1.7.5/app-bridge";
    const root = document.getElementById("root");
    let state = null;
    const app = new App({ name: "AgentUI Renderer", version: "0.0.0" }, {});
    app.ontoolresult = (params) => {
      state = params.structuredContent?.state ?? params.structuredContent?.result?.state ?? null;
      render();
    };
    app.ontoolinput = (params) => {
      if (params.arguments?.state) state = params.arguments.state;
      render();
    };
    await app.connect(new PostMessageTransport());
    function sendEvent(event) {
      void app.callServerTool({ name: "ui_event", arguments: { event } });
      if (event.type === "submit" || event.id.endsWith(":cancel") || event.id.endsWith(":confirm")) {
        state = { views: [] };
        render();
      }
    }
    function render() {
      const views = state?.views ?? [];
      if (views.length === 0) {
        root.innerHTML = '<div class="empty">No active AgentUI view.</div>';
        return;
      }
      root.replaceChildren(...views.map(renderView));
    }
    function renderView(view) {
      const section = el("section", "view");
      if (view.title) section.append(el("h2", "", view.title));
      const stack = el("div", "stack");
      for (const widget of view.children ?? []) stack.append(renderWidget(widget));
      section.append(stack);
      return section;
    }
    function renderWidget(widget) {
      if (widget.type === "text") return el("p", "", widget.text);
      if (widget.type === "markdown") return el("p", "", widget.markdown);
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
    function renderForm(widget) {
      const form = document.createElement("form");
      if (widget.title) form.append(el("h3", "", widget.title));
      if (widget.description) form.append(el("p", "", widget.description));
      for (const field of widget.fields ?? []) form.append(renderField(field));
      const actions = el("div", "actions");
      const cancel = el("button", "", widget.cancelLabel ?? "Cancel");
      cancel.type = "button";
      cancel.onclick = () => sendEvent({ type: "click", id: widget.id + ":cancel" });
      const submit = el("button", "primary", widget.submitLabel ?? "Submit");
      submit.type = "submit";
      actions.append(cancel, submit);
      form.append(actions);
      form.onsubmit = (event) => {
        event.preventDefault();
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
        input.type = "checkbox"; input.name = field.id; input.checked = Boolean(field.checked);
        input.onchange = () => sendEvent({ type: "change", id: field.id, value: input.checked });
        label.append(input, document.createTextNode(field.label));
        return label;
      }
      const label = el("label", "field");
      label.append(el("span", "", field.label));
      const input = field.type === "select" ? document.createElement("select") : document.createElement("input");
      input.name = field.id;
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
      const hrow = document.createElement("tr");
      for (const column of widget.columns ?? []) hrow.append(el("th", "", column.label));
      thead.append(hrow); table.append(thead);
      const tbody = document.createElement("tbody");
      for (const row of widget.rows ?? []) {
        const tr = document.createElement("tr");
        for (const column of widget.columns ?? []) tr.append(el("td", "", String(row[column.key] ?? "")));
        tbody.append(tr);
      }
      table.append(tbody);
      return table;
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
      cancel.onclick = () => sendEvent({ type: "click", id: widget.id + ":cancel" });
      const confirm = el("button", "primary", widget.confirmLabel ?? "Confirm");
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
  </script>
</body>
</html>`;
}

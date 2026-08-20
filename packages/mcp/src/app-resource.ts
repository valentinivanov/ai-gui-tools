import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const defaultAgentUIResourceUri = "ui://agentui/view/v1";
export const agentUIAppVersion = "20260817115450";

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
    .plot { display: grid; gap: 8px; }
    .plot-title { margin: 0; font-size: 14px; font-weight: 700; }
    .plot svg { width: 100%; min-height: 220px; border: 1px solid #d7dce2; border-radius: 6px; background: #fbfcfd; }
    .plot-axis { stroke: #94a3b8; stroke-width: 1; }
    .plot-tick { stroke: #64748b; stroke-width: 1; }
    .plot-label { fill: #475569; font-size: 11px; font-weight: 600; }
    .plot-grid { stroke: #e2e8f0; stroke-width: 1; }
    .plot-line { fill: none; stroke: #2563eb; stroke-width: 2; }
    .plot-bar { stroke: #2563eb; stroke-width: 5; stroke-linecap: round; opacity: 0.72; }
    .plot-point { fill: #2563eb; stroke: #ffffff; stroke-width: 1.5; }
    .applet { display: grid; gap: 8px; }
    .applet canvas { width: 100%; max-width: 100%; height: auto; border: 1px solid #d7dce2; border-radius: 6px; background: #0f172a; outline: none; touch-action: none; }
    .applet canvas:focus { border-color: #15803d; box-shadow: 0 0 0 3px rgb(21 128 61 / 18%); }
    .applet-status { color: #475569; font-size: 13px; line-height: 1.45; }
    .applet-error { color: #991b1b; font-size: 13px; line-height: 1.45; }
    pre { overflow: auto; margin: 0; padding: 10px; background: #f7f9fb; border: 1px solid #e2e7ed; border-radius: 6px; }
    .diff-lines { overflow: auto; margin: 0; padding: 10px; background: #f7f9fb; border: 1px solid #e2e7ed; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 12px; line-height: 1.45; }
    .diff-line { white-space: pre; }
    .diff-line-added { background: #edf8ef; color: #14532d; }
    .diff-line-removed { background: #fff1f1; color: #7f1d1d; }
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
    const appletRuntimes = new Map();
    const knownAppletModules = {
      pong: "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KQIAAAAiAAAAUAByAGUAcwBzACAAUwAgAGYAbwByACAAcwB0AGEAcgB0AEGsDwsBPABBuA8LJwIAAAAgAAAAUAByAGUAcwBzACAARQAgAGYAbwByACAAZQB4AGkAdABB7A8LARwAQfgPCxMCAAAADAAAAFMAYwBvAHIAZQAgAEGMEAsBLABBmBALGQIAAAASAAAARwBBAE0ARQAgAE8AVgBFAFIAQbwQCwE8AEHIEAsrAgAAACQAAABQAHIAZQBzAHMAIABSACAAdABvACAAcgBlAHMAdABhAHIAdABB/BALATwAQYgRCyUCAAAAHgAAAFAAcgBlAHMAcwAgAEUAIAB0AG8AIABlAHgAaQB0AEG8EQsBbABByBELXwIAAABYAAAAewAiAHQAeQBwAGUAIgA6ACIAZQB4AGkAdAAiACwAIgBwAGEAeQBsAG8AYQBkACIAOgB7ACIAcgBlAGEAcwBvAG4AIgA6ACIAdABpAHQAbABlACIAfQB9AEGsEgsBfABBuBILZwIAAABgAAAAewAiAHQAeQBwAGUAIgA6ACIAZQB4AGkAdAAiACwAIgBwAGEAeQBsAG8AYQBkACIAOgB7ACIAcgBlAGEAcwBvAG4AIgA6ACIAZwBhAG0AZQBfAG8AdgBlAHIAIgB9AH0="
    };

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
      stopApplets();
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
      if (view.a2ui) stack.append(renderA2UISurface(view.a2ui));
      else for (const widget of view.children ?? []) stack.append(renderWidget(widget));
      section.append(stack);
      return section;
    }
    function renderA2UISurface(surface) {
      const wrap = el("div", "stack");
      const components = new Map((surface.components ?? []).map((component) => [component.id, component]));
      const dataModel = surface.dataModel ?? {};
      const rootComponent = components.get(surface.root ?? "root");
      if (rootComponent) wrap.append(renderA2UIComponent(rootComponent, components, dataModel));
      return wrap;
    }
    function renderA2UIComponent(component, components, dataModel) {
      const renderChild = (id) => {
        const child = components.get(id);
        return child ? renderA2UIComponent(child, components, dataModel) : document.createTextNode("");
      };
      if (component.component === "Column") {
        const wrap = el("div", "container");
        for (const child of component.children ?? []) wrap.append(renderChild(child));
        return wrap;
      }
      if (component.component === "Row") {
        const wrap = el("div", "actions");
        for (const child of component.children ?? []) wrap.append(renderChild(child));
        return wrap;
      }
      if (component.component === "Text") return el("p", "", dynamicValue(component.text, dataModel));
      if (component.component === "Divider") return el("div", "separator");
      if (component.component === "Button") {
        const button = el("button", component.variant === "primary" ? "primary" : "");
        button.disabled = readOnly;
        button.append(renderChild(component.child));
        button.onclick = () => sendA2UIAction(component.action, component.id, dataModel);
        return button;
      }
      if (component.component === "TextField") {
        const label = el("label", "field");
        label.append(el("span", "", dynamicValue(component.label, dataModel)));
        const input = document.createElement("input");
        input.disabled = readOnly;
        input.type = component.variant === "number" ? "number" : component.variant === "obscured" ? "password" : "text";
        input.placeholder = dynamicValue(component.placeholder, dataModel);
        input.value = dynamicValue(component.value ?? "", dataModel);
        input.onchange = () => {
          const path = bindingPath(component.value);
          if (path) setDataPath(dataModel, path, input.type === "number" ? Number(input.value) : input.value);
        };
        label.append(input);
        return label;
      }
      if (component.component === "CheckBox") {
        const label = el("label", "check");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.disabled = readOnly;
        input.checked = Boolean(rawDynamicValue(component.value, dataModel));
        input.onchange = () => {
          const path = bindingPath(component.value);
          if (path) setDataPath(dataModel, path, input.checked);
        };
        label.append(input, document.createTextNode(dynamicValue(component.label, dataModel)));
        return label;
      }
      if (component.component === "ChoicePicker") {
        const label = el("label", "field");
        if (component.label) label.append(el("span", "", dynamicValue(component.label, dataModel)));
        const select = document.createElement("select");
        select.disabled = readOnly;
        select.value = String((rawDynamicValue(component.value, dataModel) ?? [])[0] ?? "");
        for (const option of component.options ?? []) {
          const opt = document.createElement("option"); opt.value = option.value; opt.textContent = dynamicValue(option.label, dataModel); select.append(opt);
        }
        select.onchange = () => {
          const path = bindingPath(component.value);
          if (path) setDataPath(dataModel, path, select.value ? [select.value] : []);
        };
        label.append(select);
        return label;
      }
      if (component.component === "agentui.Table") return renderTable({ columns: component.columns, rows: component.rows, name: component.name });
      if (component.component === "agentui.Diff") return renderDiff({ files: component.files });
      if (component.component === "agentui.Plot") return renderPlot({ title: component.title, mode: component.mode, points: component.points });
      if (component.component === "agentui.WasmApplet") return renderWasmApplet({ id: component.id, module: component.module, width: component.width, height: component.height, capabilities: component.capabilities, initialState: component.initialState });
      return el("pre", "", JSON.stringify(component, null, 2));
    }
    function sendA2UIAction(action, componentId, dataModel) {
      if (!action) return;
      if (action.name === "submit") {
        sendEvent({ type: "submit", id: action.payload?.id ?? componentId, values: recordValue(dataAtPath(dataModel, action.payload?.valuesPath ?? "/")) });
      } else if (action.name === "change") {
        sendEvent({ type: "change", id: action.payload?.id ?? componentId, value: action.payload?.value });
      } else {
        sendEvent({ type: "click", id: action.payload?.id ?? componentId });
      }
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
      if (widget.type === "plot") return renderPlot(widget);
      if (widget.type === "wasm-applet") return renderWasmApplet(widget);
      return el("pre", "", JSON.stringify(widget, null, 2));
    }
    function rawDynamicValue(value, dataModel) {
      const path = bindingPath(value);
      return path ? dataAtPath(dataModel, path) : value;
    }
    function dynamicValue(value, dataModel) {
      const resolved = rawDynamicValue(value, dataModel);
      return resolved === undefined || resolved === null ? "" : String(resolved);
    }
    function bindingPath(value) {
      return value && typeof value === "object" && !Array.isArray(value) && typeof value.path === "string" ? value.path : undefined;
    }
    function dataAtPath(dataModel, path) {
      if (!path || path === "/") return dataModel;
      return path.split("/").filter(Boolean).reduce((cursor, part) => cursor && typeof cursor === "object" && !Array.isArray(cursor) ? cursor[part] : undefined, dataModel);
    }
    function setDataPath(dataModel, path, value) {
      const parts = path.split("/").filter(Boolean);
      let cursor = dataModel;
      for (const part of parts.slice(0, -1)) {
        if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) cursor[part] = {};
        cursor = cursor[part];
      }
      const key = parts.at(-1);
      if (key) cursor[key] = value;
    }
    function recordValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    function renderWasmApplet(widget) {
      const wrap = el("div", "applet");
      const canvas = document.createElement("canvas");
      const width = Number(widget.width) || 640;
      const height = Number(widget.height) || 360;
      canvas.width = width;
      canvas.height = height;
      canvas.tabIndex = readOnly ? -1 : 0;
      canvas.setAttribute("aria-label", widget.module?.name ? widget.module.name + " applet" : "WASM applet");
      const status = el("div", "applet-status", "Loading applet...");
      wrap.append(canvas, status);
      queueMicrotask(() => startApplet(widget, canvas, status));
      return wrap;
    }
    async function startApplet(widget, canvas, status) {
      const moduleName = widget.module?.name;
      const base64 = moduleName ? knownAppletModules[moduleName] : undefined;
      if (!base64) {
        status.className = "applet-error";
        status.textContent = "Unknown applet module: " + (moduleName ?? "unnamed");
        return;
      }
      try {
        const runtime = await createInlineAppletRuntime(widget, canvas, base64);
        appletRuntimes.set(widget.id, runtime);
        status.textContent = "Click the canvas, then use the keyboard.";
      } catch (error) {
        status.className = "applet-error";
        status.textContent = "Applet failed to start: " + String(error?.message ?? error);
      }
    }
    async function createInlineAppletRuntime(widget, canvas, base64) {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D is not available");
      const decoder = new TextDecoder();
      const commands = [];
      let memory;
      let exportsObject;
      let animation = 0;
      let lastFrame = 0;
      const readText = (ptr, len) => memory ? decoder.decode(new Uint8Array(memory.buffer, ptr, len)) : "";
      const color = (value) => "#" + (value >>> 0).toString(16).padStart(8, "0").slice(0, 6);
      const imports = {
        env: {
          abort: (messagePtr, filePtr, line, column) => {
            throw new Error("WASM applet aborted at " + line + ":" + column);
          }
        },
        agentui: {
          abi_version: () => 1,
          clear: (rgba) => commands.push({ op: "clear", color: color(rgba) }),
          draw_rect: (x, y, width, height, rgba) => commands.push({ op: "rect", x, y, width, height, color: color(rgba) }),
          draw_circle: (x, y, radius, rgba) => commands.push({ op: "circle", x, y, radius, color: color(rgba) }),
          draw_line: (x1, y1, x2, y2, width, rgba) => commands.push({ op: "line", x1, y1, x2, y2, width, color: color(rgba) }),
          draw_text: (ptr, len, x, y, size, rgba) => commands.push({ op: "text", x, y, size, color: color(rgba), text: readText(ptr, len) }),
          emit_event: (ptr, len) => {
            const event = JSON.parse(readText(ptr, len));
            if (event && typeof event.type === "string") sendEvent({ type: "applet_event", id: widget.id, event });
          }
        }
      };
      const bytes = base64Bytes(base64);
      if (!WebAssembly.validate(bytes)) throw new Error("Invalid WebAssembly module");
      const instance = await WebAssembly.instantiate(bytes, imports);
      exportsObject = instance.instance ? instance.instance.exports : instance.exports;
      memory = exportsObject.memory instanceof WebAssembly.Memory ? exportsObject.memory : undefined;
      callExport(exportsObject, "init", canvas.width, canvas.height);
      flushDrawCommands(context, commands);
      const keyHandler = (event) => {
        if (readOnly) return;
        event.preventDefault();
        callExport(exportsObject, "key_event", event.type === "keydown" ? 1 : 2, browserKeyCode(event.code), event.repeat ? 1 : 0);
        flushDrawCommands(context, commands);
      };
      canvas.addEventListener("keydown", keyHandler);
      canvas.addEventListener("keyup", keyHandler);
      canvas.addEventListener("pointerdown", (event) => {
        if (readOnly) return;
        canvas.focus();
        canvas.setPointerCapture(event.pointerId);
        sendPointer(exportsObject, canvas, event, 1);
        flushDrawCommands(context, commands);
      });
      canvas.addEventListener("pointermove", (event) => {
        if (readOnly) return;
        sendPointer(exportsObject, canvas, event, 2);
        flushDrawCommands(context, commands);
      });
      canvas.addEventListener("pointerup", (event) => {
        if (readOnly) return;
        sendPointer(exportsObject, canvas, event, 3);
        flushDrawCommands(context, commands);
      });
      const tick = (time) => {
        const previous = lastFrame || time;
        lastFrame = time;
        callExport(exportsObject, "update", time - previous);
        flushDrawCommands(context, commands);
        animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
      return {
        destroy() {
          cancelAnimationFrame(animation);
          callExport(exportsObject, "destroy");
        }
      };
    }
    function stopApplets() {
      for (const runtime of appletRuntimes.values()) runtime.destroy();
      appletRuntimes.clear();
    }
    function base64Bytes(value) {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }
    function callExport(exportsObject, name, ...args) {
      const fn = exportsObject?.[name];
      if (typeof fn === "function") fn(...args);
    }
    function sendPointer(exportsObject, canvas, event, type) {
      const rect = canvas.getBoundingClientRect();
      callExport(
        exportsObject,
        "pointer_event",
        type,
        event.pointerId,
        (event.clientX - rect.left) * (canvas.width / rect.width),
        (event.clientY - rect.top) * (canvas.height / rect.height),
        event.button
      );
    }
    function browserKeyCode(code) {
      if (code === "ArrowLeft") return 37;
      if (code === "ArrowRight") return 39;
      if (code === "ArrowUp") return 38;
      if (code === "ArrowDown") return 40;
      if (code.startsWith("Key") && code.length === 4) return code.charCodeAt(3);
      if (code.startsWith("Digit") && code.length === 6) return code.charCodeAt(5);
      return code.length > 0 ? code.charCodeAt(0) : 0;
    }
    function flushDrawCommands(context, commands) {
      while (commands.length > 0) renderDrawCommand(context, commands.shift());
    }
    function renderDrawCommand(context, command) {
      context.save();
      if (command.op === "clear") {
        context.fillStyle = command.color;
        context.fillRect(0, 0, context.canvas.width, context.canvas.height);
      } else if (command.op === "rect") {
        context.fillStyle = command.color;
        context.fillRect(command.x, command.y, command.width, command.height);
      } else if (command.op === "circle") {
        context.fillStyle = command.color;
        context.beginPath();
        context.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
        context.fill();
      } else if (command.op === "line") {
        context.strokeStyle = command.color;
        context.lineWidth = command.width;
        context.beginPath();
        context.moveTo(command.x1, command.y1);
        context.lineTo(command.x2, command.y2);
        context.stroke();
      } else if (command.op === "text") {
        context.fillStyle = command.color;
        context.font = command.size + "px ui-sans-serif, system-ui, sans-serif";
        context.fillText(command.text, command.x, command.y);
      }
      context.restore();
    }
    function renderContainer(widget) {
      const wrap = el("div", "container");
      if (widget.title) wrap.append(el("h3", "container-title", widget.title));
      for (const child of widget.children ?? []) wrap.append(renderWidget(child));
      return wrap;
    }
    function renderPlot(widget) {
      const points = normalizedPlotPoints(widget.points);
      const wrap = el("div", "plot");
      if (widget.title) wrap.append(el("h3", "plot-title", widget.title));
      const svg = svgEl("svg");
      svg.setAttribute("viewBox", "0 0 640 280");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", widget.title ?? "Plot");
      if (points.length === 0) {
        const text = svgEl("text");
        text.setAttribute("x", "320"); text.setAttribute("y", "140"); text.setAttribute("text-anchor", "middle"); text.setAttribute("fill", "#64748b");
        text.textContent = "No data";
        svg.append(text);
        wrap.append(svg);
        return wrap;
      }
      const plot = plotScale(points);
      addPlotAxes(svg, plot);
      if (widget.mode === "lines") {
        const line = svgEl("polyline");
        line.setAttribute("class", "plot-line");
        line.setAttribute("points", points.map((point) => plot.x(point.x) + "," + plot.y(point.y)).join(" "));
        svg.append(line);
      }
      if (widget.mode === "bars") {
        for (const point of points) {
          const bar = svgEl("line");
          bar.setAttribute("class", "plot-bar");
          bar.setAttribute("x1", String(plot.x(point.x))); bar.setAttribute("x2", String(plot.x(point.x)));
          bar.setAttribute("y1", String(plot.xAxisY)); bar.setAttribute("y2", String(plot.y(point.y)));
          svg.append(bar);
        }
      }
      if (widget.mode !== "bars") {
        for (const point of points) {
          const circle = svgEl("circle");
          circle.setAttribute("class", "plot-point");
          circle.setAttribute("cx", String(plot.x(point.x))); circle.setAttribute("cy", String(plot.y(point.y))); circle.setAttribute("r", "4");
          svg.append(circle);
        }
      }
      wrap.append(svg);
      return wrap;
    }
    function normalizedPlotPoints(points) {
      return (points ?? [])
        .map((point) => Array.isArray(point) ? { x: Number(point[0]), y: Number(point[1]) } : { x: Number(point?.x), y: Number(point?.y) })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    }
    function plotScale(points) {
      let minX = Math.min(...points.map((point) => point.x));
      let maxX = Math.max(...points.map((point) => point.x));
      let minY = Math.min(...points.map((point) => point.y));
      let maxY = Math.max(...points.map((point) => point.y));
      if (minX === maxX) { minX -= 1; maxX += 1; }
      if (minY === maxY) { minY -= 1; maxY += 1; }
      const xTicks = axisTicks(minX, maxX);
      const yTicks = axisTicks(minY, maxY);
      const padX = (maxX - minX) * 0.05;
      const padY = (maxY - minY) * 0.08;
      minX -= padX; maxX += padX; minY -= padY; maxY += padY;
      const left = 58, top = 16, width = 548, height = 210;
      const xScale = (value) => left + ((value - minX) / (maxX - minX)) * width;
      const yScale = (value) => top + height - ((value - minY) / (maxY - minY)) * height;
      return {
        left, top, width, height,
        xTicks, yTicks,
        xAxisY: clamp(yScale(0), top, top + height),
        yAxisX: clamp(xScale(0), left, left + width),
        x: xScale,
        y: yScale
      };
    }
    function axisTicks(min, max) {
      const unit = axisUnit(min, max);
      const crossesZero = min <= 0 && max >= 0;
      const start = crossesZero ? Math.ceil(min / unit) * unit : min > 0 ? min : max;
      const end = crossesZero ? Math.floor(max / unit) * unit : min > 0 ? max : min;
      const step = crossesZero || min > 0 ? unit : -unit;
      const ticks = [];
      for (let value = start; step > 0 ? value <= end : value >= end; value += step) ticks.push(normalizeTick(value));
      return ticks.sort((a, b) => a - b);
    }
    function axisUnit(min, max) {
      return Math.max(unitForMagnitude(Math.max(0, max)), unitForMagnitude(Math.max(0, -min)));
    }
    function unitForMagnitude(value) {
      if (value < 10) return 1;
      return 10 ** Math.floor(Math.log10(value));
    }
    function formatTick(value) {
      return String(normalizeTick(value));
    }
    function normalizeTick(value) {
      const normalized = Object.is(value, -0) ? 0 : value;
      return Math.abs(normalized) < 1e-10 ? 0 : Number(normalized.toPrecision(12));
    }
    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
    function addPlotAxes(svg, plot) {
      for (let i = 0; i <= 4; i++) {
        const y = plot.top + (plot.height / 4) * i;
        const grid = svgEl("line");
        grid.setAttribute("class", "plot-grid");
        grid.setAttribute("x1", String(plot.left)); grid.setAttribute("x2", String(plot.left + plot.width));
        grid.setAttribute("y1", String(y)); grid.setAttribute("y2", String(y));
        svg.append(grid);
      }
      for (const tick of plot.xTicks) {
        const group = svgEl("g");
        const mark = svgEl("line");
        mark.setAttribute("class", "plot-tick");
        mark.setAttribute("x1", String(plot.x(tick))); mark.setAttribute("x2", String(plot.x(tick)));
        mark.setAttribute("y1", String(plot.xAxisY - 4)); mark.setAttribute("y2", String(plot.xAxisY + 4));
        const label = svgEl("text");
        label.setAttribute("class", "plot-label");
        label.setAttribute("x", String(plot.x(tick)));
        label.setAttribute("y", String(Math.min(plot.xAxisY + 18, plot.top + plot.height + 24)));
        label.setAttribute("text-anchor", "middle");
        label.textContent = formatTick(tick);
        group.append(mark, label);
        svg.append(group);
      }
      for (const tick of plot.yTicks) {
        const group = svgEl("g");
        const mark = svgEl("line");
        mark.setAttribute("class", "plot-tick");
        mark.setAttribute("x1", String(plot.yAxisX - 4)); mark.setAttribute("x2", String(plot.yAxisX + 4));
        mark.setAttribute("y1", String(plot.y(tick))); mark.setAttribute("y2", String(plot.y(tick)));
        const label = svgEl("text");
        label.setAttribute("class", "plot-label");
        label.setAttribute("x", String(Math.max(plot.yAxisX - 8, 8)));
        label.setAttribute("y", String(plot.y(tick) + 4));
        label.setAttribute("text-anchor", "end");
        label.textContent = formatTick(tick);
        group.append(mark, label);
        svg.append(group);
      }
      const xAxis = svgEl("line");
      xAxis.setAttribute("class", "plot-axis");
      xAxis.setAttribute("x1", String(plot.left)); xAxis.setAttribute("x2", String(plot.left + plot.width));
      xAxis.setAttribute("y1", String(plot.xAxisY)); xAxis.setAttribute("y2", String(plot.xAxisY));
      svg.append(xAxis);
      const yAxis = svgEl("line");
      yAxis.setAttribute("class", "plot-axis");
      yAxis.setAttribute("x1", String(plot.yAxisX)); yAxis.setAttribute("x2", String(plot.yAxisX));
      yAxis.setAttribute("y1", String(plot.top)); yAxis.setAttribute("y2", String(plot.top + plot.height));
      svg.append(yAxis);
    }
    function svgEl(tag) {
      return document.createElementNS("http://www.w3.org/2000/svg", tag);
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
        details.append(el("summary", "", file.path), renderDiffLines(file.patch ?? ["--- before", file.oldText ?? "", "+++ after", file.newText ?? ""].join("\\n")));
        wrap.append(details);
      }
      return wrap;
    }
    function renderDiffLines(text) {
      const pre = el("pre", "diff-lines");
      for (const line of String(text).split("\\n")) {
        const row = el("div", diffLineClass(line), line.length > 0 ? line : " ");
        pre.append(row);
      }
      return pre;
    }
    function diffLineClass(line) {
      if (line.startsWith("+") && !line.startsWith("+++")) return "diff-line diff-line-added";
      if (line.startsWith("-") && !line.startsWith("---")) return "diff-line diff-line-removed";
      return "diff-line";
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

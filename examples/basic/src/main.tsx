import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createAgentUI, type AgentUIState, type UIEvent, type View, type Widget } from "@agentui/core";
import { AgentUI } from "@agentui/react";
import "@agentui/react/styles.css";
import { createOpenAIAdapter } from "@agentui/openai";
import { runMockEventTurn, runMockTurn } from "./mockAgent.js";
import "./styles.css";

type Mode = "mock" | "live";
type LiveSession = {
  send(input: string): Promise<string>;
  sendEvent(event: UIEvent): Promise<string>;
};
type DebugEntry = {
  at: string;
  label: string;
  data: unknown;
};

declare const __AGENTUI_PROXY_BASE_URL__: string;

function App(): React.ReactElement {
  const ui = useMemo(() => createAgentUI(), []);
  const appletModules = useMemo(() => ({ pong: "/applets/pong/applet.wasm" }), []);
  const toolDefinitions = useMemo(() => ui.toolProvider.definitions(), [ui]);
  const providerToolDefinitions = useMemo(() => createOpenAIAdapter(ui).tools(), [ui]);
  const [mode, setMode] = useState<Mode>(import.meta.env.VITE_OPENAI_API_KEY ? "live" : "mock");
  const [input, setInput] = useState("Configure deployment for this service.");
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent" | "event"; content: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveSession | null>(null);
  const [uiState, setUiState] = useState<AgentUIState>(() => ui.getState());
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [uiEvents, setUiEvents] = useState<UIEvent[]>([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const busyRef = useRef(false);

  const liveBaseURL = import.meta.env.VITE_OPENAI_BASE_URL || `${window.location.origin}/api/openai/v1`;
  const liveApiKey = import.meta.env.VITE_OPENAI_API_KEY || "agentui-dev-proxy";
  const hasLiveKey = Boolean(liveApiKey);

  useEffect(() => ui.subscribe((state) => setUiState(state)), [ui]);

  useEffect(
    () =>
      ui.subscribeEvents((event) => {
        addDebug("ui.event", event);
        void handleEvent(event);
      }),
    [ui, mode, live]
  );

  useEffect(() => {
    if (!hasLiveKey || mode !== "live" || live) return;

    void import("./liveOpenAI.js").then(({ createLiveOpenAISession }) => {
      setLive(createLiveOpenAISession(ui, liveApiKey, liveBaseURL));
    });
  }, [hasLiveKey, live, liveApiKey, liveBaseURL, mode, ui]);

  async function send(text: string): Promise<void> {
    if (!text.trim()) return;
    if (!beginTurn("user.turn", text)) return;
    setMessages((current) => [...current, { role: "user", content: text }]);
    addDebug("user.input", text);
    try {
      const reply = mode === "live" && live ? await live.send(text) : await runMockTurn(ui, text);
      setMessages((current) => [...current, { role: "agent", content: reply }]);
      addDebug("agent.reply", reply);
    } catch (error) {
      setMessages((current) => [...current, { role: "agent", content: errorMessage(error) }]);
      addDebug("agent.error", errorMessage(error));
    } finally {
      endTurn("user.turn");
    }
  }

  async function handleEvent(event: UIEvent): Promise<void> {
    setUiEvents((current) => [event, ...current].slice(0, 40));
    if (event.type === "change") {
      addDebug("ui.localChange", "Change events update local UI state only. They are not sent to the agent loop.");
      return;
    }

    if (!beginTurn("ui.eventTurn", event)) return;
    closeViewForEvent(event);

    try {
      const reply = mode === "live" && live ? await live.sendEvent(event) : await runMockEventTurn(event);
      setMessages((current) => [...current, { role: "agent", content: reply }]);
      addDebug("agent.eventReply", reply);
    } catch (error) {
      setMessages((current) => [...current, { role: "agent", content: errorMessage(error) }]);
      addDebug("agent.error", errorMessage(error));
    } finally {
      endTurn("ui.eventTurn");
    }
  }

  function addDebug(label: string, data: unknown): void {
    setDebugEntries((current) => [{ at: new Date().toLocaleTimeString(), label, data }, ...current].slice(0, 80));
  }

  function beginTurn(label: string, data: unknown): boolean {
    if (busyRef.current) {
      addDebug("turn.ignoredWhileBusy", { label, data });
      return false;
    }

    busyRef.current = true;
    setBusy(true);
    addDebug("turn.start", { label, data });
    return true;
  }

  function endTurn(label: string): void {
    busyRef.current = false;
    setBusy(false);
    addDebug("turn.end", label);
  }

  function closeViewForEvent(event: UIEvent): void {
    if (event.type === "applet_event" && event.event.type !== "exit") {
      return;
    }
    const view = findViewForEvent(ui.getState().views, event);
    if (view) {
      ui.dispatch({ type: "close_view", id: view.id });
      addDebug("ui.closeView", { viewId: view.id, reason: event });
    }
  }

  return (
    <main className="app-shell">
      <section className="conversation">
        <header>
          <div>
            <h1>AgentUI PoC</h1>
            <p>Renderer-independent UI exposed as ordinary LLM tools.</p>
          </div>
          <div className="mode-toggle" aria-label="Mode">
            <button className={mode === "mock" ? "active" : ""} onClick={() => setMode("mock")}>
              Mock
            </button>
            <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")} disabled={!hasLiveKey}>
              Live OpenAI
            </button>
            <button className={overlayOpen ? "active" : ""} onClick={() => setOverlayOpen(true)}>
              Overlay
            </button>
          </div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="message agent">
              <span>agent</span>
              <p>Send a sample prompt. When UI is useful, the mock agent will call AgentUI tools and render an interactive view below.</p>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <span>{message.role}</span>
              <p>{message.content}</p>
            </div>
          ))}
        </div>

        <section className="inline-ui" aria-label="Agent UI">
          <div className="inline-ui-header">
            <span>AgentUI</span>
            <button type="button" onClick={() => setOverlayOpen(true)}>
              Open overlay
            </button>
          </div>
          <AgentUI ui={ui} appletModules={appletModules} empty={<div className="empty-ui">No active AgentUI view.</div>} />
        </section>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            disabled={busy}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Ask for deployment, comparison, review, confirmation, or plain text"
          />
          <button disabled={busy}>{busy ? "Working..." : "Send"}</button>
        </form>
        <div className="samples" aria-label="Sample prompts">
          <button disabled={busy} onClick={() => setInput("Configure deployment for this service.")}>
            Deployment
          </button>
          <button disabled={busy} onClick={() => setInput("Help me choose between Postgres, DynamoDB and SQLite.")}>
            Compare
          </button>
          <button disabled={busy} onClick={() => setInput("Review these proposed changes.")}>
            Diff
          </button>
          <button disabled={busy} onClick={() => setInput("Open the Pong WASM game.")}>
            WASM game
          </button>
          <button disabled={busy} onClick={() => setInput("Explain why the sky is blue.")}>
            Plain text
          </button>
        </div>
      </section>

      <aside className="debug-pane">
        <div className="debug-header">
          <div>
            <h2>Debug</h2>
            <p>Tool calls, events, and renderer-independent state.</p>
          </div>
          <button type="button" onClick={() => setDebugEntries([])}>
            Clear
          </button>
        </div>

        <DebugBlock
          title="Runtime"
          data={{
            mode,
            views: uiState.views.length,
            tools: toolDefinitions.map((tool) => tool.name),
            liveOpenAIEnabled: hasLiveKey,
            browserBaseURL: liveBaseURL,
            proxyTargetBaseURL: __AGENTUI_PROXY_BASE_URL__,
            browserKeyExposed: Boolean(import.meta.env.VITE_OPENAI_API_KEY)
          }}
        />
        <DebugTextArea title="UI Events" value={uiEvents.map((event) => JSON.stringify(event)).join("\n")} />
        <DebugBlock title="Prompt Instructions" data={ui.instructions} />
        <DebugBlock title="Provider Tool Definitions" data={providerToolDefinitions} />
        <DebugBlock title="Current UI State" data={uiState} />
        <DebugBlock title="Recent Events" data={debugEntries} />
      </aside>

      <div className={`overlay-scrim ${overlayOpen ? "is-open" : ""}`} onClick={() => setOverlayOpen(false)} />
      <aside className={`ui-overlay ${overlayOpen ? "is-open" : ""}`} aria-hidden={!overlayOpen}>
        <div className="ui-overlay-header">
          <div>
            <h2>AgentUI Overlay</h2>
            <p>The same renderer-independent state, rendered outside the chat flow.</p>
          </div>
          <button type="button" onClick={() => setOverlayOpen(false)}>
            Close
          </button>
        </div>
        <AgentUI ui={ui} appletModules={appletModules} empty={<div className="empty-ui">No active AgentUI view.</div>} />
      </aside>
    </main>
  );
}

function DebugBlock({ title, data }: { title: string; data: unknown }): React.ReactElement {
  return (
    <section className="debug-block">
      <h3>{title}</h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}

function DebugTextArea({ title, value }: { title: string; value: string }): React.ReactElement {
  return (
    <section className="debug-block">
      <h3>{title}</h3>
      <textarea readOnly value={value} placeholder="UI events will appear here." />
    </section>
  );
}

function findViewForEvent(views: View[], event: UIEvent): View | undefined {
  return views.find((view) => view.children.some((widget) => widgetMatchesEvent(widget, event)));
}

function widgetMatchesEvent(widget: Widget, event: UIEvent): boolean {
  if ("id" in widget && typeof widget.id === "string") {
    if (widget.id === event.id) return true;
    if (event.type === "click" && (event.id === `${widget.id}:cancel` || event.id === `${widget.id}:confirm`)) return true;
  }

  if (widget.type === "form") {
    if (widget.id === event.id || (event.type === "click" && event.id === `${widget.id}:cancel`)) return true;
    return widget.fields.some((field) => field.id === event.id);
  }

  if (widget.type === "tabs") {
    return widget.tabs.some((tab) => tab.children.some((child) => widgetMatchesEvent(child, event)));
  }

  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

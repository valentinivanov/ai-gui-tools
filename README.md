# AgentUI

Prototype TypeScript library for renderer-independent interactive UI as an LLM tool capability: "Dear ImGui for LLMs/agents."

AgentUI is not an agent framework. It exposes UI tools that can be added to an existing tool-calling loop, stores the resulting UI state, and lets renderers observe that state.

```text
user request
  -> LLM decides UI is useful
  -> LLM calls an AgentUI semantic tool
  -> AgentUI updates renderer-independent state
  -> React renders the state
  -> user interacts with the UI
  -> AgentUI emits a semantic event
  -> host application feeds that event back into its agent loop
```

## Packages

- `@agentui/core`: protocol types, state management, semantic tool provider, event handling.
- `@agentui/openai`: OpenAI Responses API tool conversion and tool-call helpers.
- `@agentui/react`: reference React renderer and minimal default CSS.
- `@agentui/mcp`: MCP tools, Streamable HTTP/stdio server helpers, and MCP Apps resource shell.
- `examples/basic`: Vite + React PoC with mock mode and optional live OpenAI mode.
- `examples/mcp`: runnable MCP server example.

The monorepo root is private. Package names use the intended future names, but this PoC is not set up for publishing.

## Install

```sh
pnpm install
pnpm build
pnpm test
```

Run the example:

```sh
pnpm dev
```

The example runs in mock mode without an API key. It deterministically demonstrates deployment forms, comparison tables, diff review, confirmations, plain text fallback, and UI event feedback.

Optional live mode:

```sh
OPENAI_API_KEY=... pnpm dev
```

Optional custom API endpoint:

```sh
OPENAI_API_KEY=... OPENAI_BASE_URL=http://127.0.0.1:8080/v1 pnpm dev
```

Optional model override:

```sh
OPENAI_API_KEY=... VITE_OPENAI_MODEL=gpt-4.1-mini pnpm dev
```

For NVIDIA Hosted Integrate:

```sh
NVIDIA_API_KEY=... \
OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1 \
VITE_OPENAI_MODEL=nvidia/nemotron-3-nano-30b-a3b \
pnpm dev
```

The example uses a Vite development proxy at `/api/openai/v1` so local browser requests do not hit provider CORS restrictions, and the real API key stays in the Vite server process. Production applications should route live model calls through their own backend.

## Core Usage

```ts
import { createAgentUI } from "@agentui/core";

const ui = createAgentUI({
  capabilities: ["form", "table", "diff", "confirm", "view.replace"]
});

ui.subscribe((state) => {
  renderSomewhere(state);
});

ui.subscribeEvents((event) => {
  // Feed this semantic event back into your existing agent loop.
});
```

AgentUI owns UI state, not conversation history. The current v0 state model uses whole-view replacement with stable view and widget IDs. The internal API is intentionally simple enough to add incremental view operations later.

## Architecture

AgentUI is a renderer-independent interactive UI capability for LLMs.

Models access AgentUI through ordinary semantic UI tools. Those tools can currently be transported through:

- the OpenAI SDK adapter
- MCP

```text
                    LLM
                     |
              semantic UI tools
                     |
                AgentUI Core
                     |
        +------------+------------+
        |                         |
     React renderer            future renderers
        |
        v
      user


Tool transport:

      OpenAI SDK          MCP
           \\              /
            \\            /
             AgentUI Core
```

Keep these concepts separate:

- Tool transport: OpenAI function tools or MCP tools.
- UI protocol: AgentUI views, widgets, and semantic events.
- UI renderer: React today; terminal, native, or other renderers later.
- Application actions: privileged host tools such as deploy, filesystem, git, or database actions.

## OpenAI Responses Integration

```ts
import OpenAI from "openai";
import { createAgentUI } from "@agentui/core";
import { createOpenAIAdapter } from "@agentui/openai";

const client = new OpenAI();
const ui = createAgentUI();
const uiAdapter = createOpenAIAdapter(ui);

const response = await client.responses.create({
  model: "gpt-4.1-mini",
  input: [
    { role: "developer", content: ui.instructions },
    { role: "user", content: "Configure deployment for this service." }
  ],
  tools: [
    ...existingTools,
    ...uiAdapter.tools()
  ]
});

for (const item of response.output) {
  if (item.type !== "function_call") continue;

  const handled = await uiAdapter.handle(item);
  if (handled) {
    // Add handled as a function_call_output item in your existing loop.
    continue;
  }

  await existingToolHandler(item);
}
```

UI events are ordinary semantic inputs back to the host loop:

```ts
ui.subscribeEvents((event) => {
  const input = uiAdapter.eventInput(event);
  // Send input through your existing Responses API loop.
});
```

## MCP Integration

`@agentui/mcp` exposes the same AgentUI semantic tools through MCP. Canonical core names remain dotted, such as `ui.form`, while the MCP adapter maps them to host-safe transport names by default, such as `ui_form`.

Embedded server usage:

```ts
import { createAgentUI } from "@agentui/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentUITools } from "@agentui/mcp";

const ui = createAgentUI();
const server = new McpServer({ name: "my-server", version: "1.0.0" });

registerAgentUITools(server, {
  ui,
  capabilities: ["form", "table", "compare", "confirm"]
});

registerMyApplicationTools(server);
```

Standalone Streamable HTTP:

```sh
pnpm build
pnpm agentui-mcp -- --http --port=3000
```

Endpoint:

```text
http://localhost:3000/mcp
```

Standalone stdio:

```sh
pnpm build
pnpm agentui-mcp -- --stdio
```

The MCP package also registers an MCP Apps resource at:

```text
ui://agentui/view/v1
```

UI-producing tools include `_meta.ui.resourceUri` pointing at that resource and return structured state as well as text fallback content. Hosts without MCP Apps rendering can still inspect the structured/text result.

Event policy:

- `change` is local by default and updates AgentUI state without a model turn.
- `submit` is a model-turn event.
- `:confirm` and `:cancel` clicks are model-turn events.
- Future widgets can opt into different event policies without changing the core transport model.

ChatGPT testing path:

1. Start the Streamable HTTP server locally.
2. Expose `http://localhost:3000/mcp` over an HTTPS URL using your preferred tunnel or deployment path.
3. Register/connect that HTTPS MCP endpoint in ChatGPT Developer Mode / MCP Apps.
4. Try prompts such as `Help me configure a TypeScript backend project.` and `Compare PostgreSQL, SQLite and DynamoDB for an offline-first application.`
5. Also try `Explain what dependency injection is.` Correct non-activation matters too.

Codex testing path:

Connect the stdio command or Streamable HTTP endpoint using the Codex MCP configuration mechanism available in your host. Initially expect tool discovery and invocation. Interactive rendering depends on whether that Codex surface supports MCP Apps resources; do not assume every MCP-capable host renders `text/html;profile=mcp-app`.

## React Renderer

```tsx
import { AgentUI } from "@agentui/react";
import "@agentui/react/styles.css";

export function App() {
  return <AgentUI ui={ui} />;
}
```

React concepts do not appear in `@agentui/core`. The protocol describes widgets such as forms, tables, diffs, confirmations, tabs, and progress. Styling is renderer-owned and can be replaced by consumers.

## Tool Surface

The PoC exposes semantic tools:

- `ui.form`
- `ui.choice`
- `ui.table`
- `ui.compare`
- `ui.diff`
- `ui.confirm`
- `ui.progress`
- `ui.view.replace`

Low-level widgets exist in the protocol representation, but v0 intentionally avoids exposing a large collection of low-level LLM tools.

Buttons and form controls never contain executable business logic. They emit events such as:

```ts
{ type: "click", id: "apply_changes" }
{ type: "change", id: "replicas", value: 3 }
{ type: "submit", id: "deployment:form", values: { environment: "production" } }
```

The host application decides what privileged application tools, if any, should run after those events.

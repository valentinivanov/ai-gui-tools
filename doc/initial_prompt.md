Design and implement a prototype TypeScript library for a concept that could be described as **“Dear ImGui for LLMs/agents.”**

The core idea is that LLMs should not be limited to chat or voice as their user interface. For many tasks, a form, table, diff viewer, selector, tree, confirmation dialog, progress view, or other transient GUI/TUI would be much more effective.

The LLM should not generate arbitrary HTML, React code, JavaScript, or native GUI code. Instead, UI construction should be exposed to the LLM as a set of normal tools/function calls, just like filesystem, search, Git, or application tools.

The library should integrate with applications that already use official LLM SDKs. Do not build a new agent framework. The goal is to provide a UI capability that can be added to an existing tool-calling loop with minimal changes.

### Core principles

1. Implement the prototype in TypeScript.

2. Keep the core protocol vendor-neutral. OpenAI, Anthropic, MCP, React, terminal rendering, etc. should be adapters around the same underlying representation.

3. The LLM sees UI primitives as ordinary tools.

Conceptually:

```text
LLM
 ├── application tools
 ├── filesystem tools
 ├── search tools
 └── UI tools
        ↓
     UI state
        ↓
     renderer
```

4. The model should be able to decide on its own when UI is more suitable than text. It should not require the user to explicitly say “create a GUI.”

Tool descriptions and a small policy instruction should communicate something like:

> You may use interactive UI tools whenever they would make a task clearer, faster, or easier for the user. Do not wait for the user to explicitly request UI.

5. Do not involve the model in rendering frames. The conceptual model is similar to Dear ImGui, but operationally it must be event-driven.

The LLM describes the interface once or mutates it when necessary. The client retains and renders it locally.

Meaningful user events are sent back to the agent:

```text
checkbox_changed
button_clicked
form_submitted
selection_changed
```

The model must not be called at 60 FPS.

### UI abstraction

Define a renderer-independent UI intermediate representation.

Start with a typed discriminated union similar to:

```ts
type Widget =
  | TextWidget
  | MarkdownWidget
  | ButtonWidget
  | CheckboxWidget
  | SelectWidget
  | InputWidget
  | FormWidget
  | TableWidget
  | TreeWidget
  | TabsWidget
  | ProgressWidget
  | DiffWidget
  | ConfirmationWidget;
```

Each interactive widget should have a stable ID.

Example:

```ts
interface ButtonWidget {
  type: "button";
  id: string;
  label: string;
}
```

Define corresponding events:

```ts
type UIEvent =
  | { type: "click"; id: string }
  | { type: "change"; id: string; value: unknown }
  | { type: "submit"; id: string; values: Record<string, unknown> };
```

The core library owns persistent UI state.

The renderer observes that state.

The SDK adapter translates model tool calls into UI commands.

### Prefer semantic tools

Do not expose only low-level layout primitives.

The model should preferably work with semantic interaction tools such as:

```text
ui.form
ui.choice
ui.compare
ui.review
ui.confirm
ui.table
ui.tree
ui.diff
```

Lower-level widgets may also exist:

```text
ui.text
ui.markdown
ui.button
ui.checkbox
ui.select
ui.input
ui.tabs
ui.progress
```

The tool descriptions should explain when each interaction is appropriate.

Examples:

```text
ui.form
Use when several related inputs or choices need to be collected.

ui.compare
Use when the user needs to compare several alternatives across
multiple criteria.

ui.diff
Use when reviewing proposed changes.

ui.confirm
Use when a consequential action requires explicit approval.
```

Avoid making the model manually specify CSS-like layout.

The design should feel closer to Dear ImGui than DOM programming.

### Architecture

Aim for a package structure approximately like:

```text
@agentui/core
@agentui/openai
@agentui/anthropic
@agentui/react
```

Potential later packages:

```text
@agentui/terminal
@agentui/mcp
@agentui/vercel-ai
@agentui/langchain
```

For the prototype, implement at least:

```text
packages/core
packages/openai
packages/react
examples/basic
```

Use a monorepo if convenient.

### Core API

Design a clean API around something like:

```ts
const ui = createAgentUI();
```

The core should expose:

```ts
ui.state
ui.subscribe(...)
ui.dispatch(...)
ui.handleToolCall(...)
ui.handleEvent(...)
```

or a cleaner equivalent.

Also introduce a vendor-neutral tool-provider abstraction, conceptually:

```ts
interface ToolProvider {
  definitions(): ToolDefinition[];

  invoke(
    name: string,
    args: unknown
  ): Promise<ToolResult>;
}
```

AgentUI itself should be capable of exposing its UI capabilities through such a provider.

### OpenAI integration

The goal is that an application already using the official OpenAI TypeScript SDK can add AgentUI without changing its architecture.

Developer experience should look roughly like:

```ts
const ui = createAgentUI();

const tools = [
  ...existingTools,
  ...openAI.tools(ui)
];

const response = await client.responses.create({
  model: "...",
  input,
  tools
});
```

Then application tool calls can be routed approximately like:

```ts
const result =
  await uiAdapter.handle(toolCall)
  ?? await existingToolHandler(toolCall);
```

Do not assume AgentUI owns the agent loop.

It should participate in an existing loop.

Keep the OpenAI-specific tool schema conversion inside `@agentui/openai`.

The core package must not import the OpenAI SDK.

### React integration

Implement a simple renderer:

```tsx
<AgentUI ui={ui} />
```

or equivalent.

The React package should observe UI state and render the supported widget tree.

Do not allow React concepts to leak into the core protocol.

Bad:

```ts
interface Widget {
  render(): ReactNode;
}
```

Good:

```ts
interface View {
  children: Widget[];
}
```

The React renderer maps protocol objects to React components.

### State and events

Keep UI state independent of conversation history where possible.

For example:

```ts
interface AgentUIState {
  views: View[];
}
```

The model should be able to create, update, replace, and close views.

Consider commands such as:

```text
CreateView
ReplaceView
AddWidget
UpdateWidget
RemoveWidget
CloseView
```

However, do not overcomplicate the first version. A whole-view replacement model is acceptable for the prototype if it produces a cleaner API.

### Security and capabilities

Treat UI as a capability.

The host should control which UI tools are exposed.

For example:

```ts
createAgentUI({
  capabilities: [
    "text",
    "form",
    "table",
    "diff",
    "confirmation"
  ]
});
```

Do not support arbitrary HTML or executable JavaScript.

A button itself must not contain arbitrary application logic.

For example:

```text
Button:
  id = "apply_changes"
  label = "Apply changes"
```

should emit:

```text
UIEvent:
  type = "click"
  id = "apply_changes"
```

The model or host may then call the actual business tool, such as:

```text
git.apply_patch
```

Keep presentation and privileged actions separate.

### Example scenarios

Include examples showing the model selecting an appropriate modality.

#### Configuration

User:

```text
Configure deployment for this service.
```

Expected UI:

```text
Deployment

Environment
[ Production v ]

Replicas
[ 3 ]

[x] Autoscaling
[ ] Public ingress

[ Deploy ]
```

#### Comparison

User:

```text
Help me choose between Postgres, DynamoDB and SQLite for this project.
```

Potential interface:

```text
Database comparison

             Cost   Scale   Ops   Offline
Postgres
DynamoDB
SQLite

Priority:
Cost        [------]
Scale       [------]
Simplicity  [------]

[ Recalculate ]
```

#### Code review

User:

```text
Review these proposed changes and let me decide what to apply.
```

Potential interface:

```text
Proposed changes

[x] src/network.cpp
[x] src/network.h
[ ] tests/network_tests.cpp

[ View diff ]
[ Apply selected ]
[ Explain ]
```

#### Plain text

User:

```text
Explain why the sky is blue.
```

The model should simply answer normally. UI is optional, not mandatory.

### Prompt/tool guidance

Create a small reusable instruction string that applications can inject into their agent/system/developer prompt.

Something along the lines of:

```text
You have access to interactive UI tools.

Use them when an interactive representation would make the user's task
clearer, faster, easier to understand, or easier to complete.

You do not need to wait for the user to explicitly request a GUI.

Prefer normal conversational text when interaction would add no value.
```

Also rely heavily on descriptive tool metadata rather than a giant rule-based prompt.

### Deliverables

Implement a functioning prototype, not just interfaces.

Include:

* TypeScript types for the UI protocol.
* Runtime UI state management.
* Tool definitions.
* Tool-call dispatch.
* UI event handling.
* OpenAI SDK adapter.
* React renderer.
* At least one working example.
* Tests for core state transitions and event handling.
* README explaining the architecture and integration model.

Keep dependencies minimal.

Prefer clear code over framework-heavy abstractions.

### Important architectural constraint

This project is NOT:

* another agent framework,
* a replacement for the OpenAI SDK,
* a React-only AI component library,
* a system where the LLM generates HTML,
* a remote desktop protocol.

It is:

> A renderer-independent interactive UI capability exposed to LLMs through ordinary tool calling.

The long-term idea is that the same model-generated interaction could eventually be rendered by React, Electron, a terminal UI, native desktop software, or other clients without changing the agent-level semantics.

Treat this first implementation as a proof of concept for that architecture.

Use the following implementation choices for the PoC:

1. **Package manager:** use `pnpm` workspaces.

2. **Example shape:** make `examples/basic` a Vite + React browser app. The main purpose of the example is to demonstrate that an LLM can create and drive an actual interactive UI, so a browser example is the most useful first proof.

3. **OpenAI adapter:** target the current official `openai` TypeScript SDK and the Responses API only. Do not add Chat Completions compatibility in the PoC. Keep the adapter architecture clean enough that compatibility layers could be added later.

4. **Tool model:** expose primarily semantic tools such as:

   * `ui.form`
   * `ui.choice`
   * `ui.table`
   * `ui.compare`
   * `ui.diff`
   * `ui.confirm`
   * `ui.progress`

   Also provide a general `ui.view.replace` escape hatch that accepts a renderer-independent widget tree.

   Do not expose a large Dear-ImGui-like collection of individual low-level tools yet. Low-level widgets should exist in the protocol representation, but they do not all need to become individual LLM tools in v0.

5. **UI state model:** whole-view replacement is acceptable and preferred for v0.

   Use stable IDs for views and interactive widgets, and preserve/control values where appropriate. Design the internal API so incremental operations such as add/update/remove can be introduced later without changing the core protocol fundamentally.

   Avoid implementing incremental mutation merely for completeness in this first version.

6. **Event flow:** implement both modes:

   * A local/mock agent mode that requires no API key and demonstrates the complete UI/event lifecycle deterministically.
   * A documented live OpenAI mode where UI events are fed back into a Responses API tool-calling loop.

   The mock mode should make the repository immediately runnable after cloning.

7. **Styling:** provide minimal but clean and usable default CSS.

   Styling must remain entirely outside the protocol. The protocol should express semantic structure and state, not CSS classes, colors, spacing, fonts, or React-specific presentation details.

   Consumers should later be able to replace or override the renderer styling.

8. **Package naming:** use:

   ```text
   @agentui/core
   @agentui/openai
   @agentui/react
   ```

   for now.

   Keep the monorepo root private so nothing is accidentally published. Individual packages do not need to be published as part of the PoC.

   Do not let npm publishing concerns complicate the architecture at this stage.

9. **Build and tests:** use `tsup` for package builds and `vitest` for testing.

   Prefer a small, conventional toolchain. Avoid adding unnecessary build abstractions.

10. **General implementation priority:** optimize for proving the architectural idea, not for API completeness.

The most important end-to-end path is:

```text
user request
    ↓
LLM decides interactive UI is useful
    ↓
LLM calls AgentUI semantic tool
    ↓
AgentUI updates renderer-independent state
    ↓
React renders the UI
    ↓
user interacts with it
    ↓
AgentUI emits semantic UI event
    ↓
event goes back into the agent loop
    ↓
LLM continues the task
```

Make that flow extremely clear in both the implementation and README.

11. **Keep AgentUI independent from the agent framework.**

The library must not take ownership of the OpenAI conversation loop. The OpenAI adapter should expose tool definitions and helpers for decoding/handling AgentUI tool calls and events, while allowing the host application to continue using the official SDK directly.

12. **Keep the protocol broader than the first renderer.**

React/Vite is only the reference renderer for the PoC. Do not introduce React concepts into `@agentui/core`.

The same core protocol should plausibly support future implementations such as:

```text
@agentui/terminal
@agentui/electron
@agentui/native
@agentui/mcp
```

13. **Prefer simple explicit code over premature abstraction.**

This is an architectural PoC. Build enough structure to demonstrate the concept cleanly, but do not build a generalized UI framework, complex layout engine, schema compiler, plugin system, or extensive compatibility layer yet.

One additional point: there is a duplicated question about the test/build stack in the original list. Treat it as a single requirement: use `tsup` + `vitest`.

Proceed with these assumptions without asking for further clarification unless an implementation blocker is genuinely impossible to resolve from the architecture above.

14. Leave LICENSE file as is.

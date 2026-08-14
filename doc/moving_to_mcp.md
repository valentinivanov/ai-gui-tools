Extend the existing AgentUI proof of concept toward an MCP-first architecture so it can be used by real AI hosts such as ChatGPT, Codex, and other MCP-capable clients.

The current project already has the core idea working:

* TypeScript monorepo
* renderer-independent AgentUI protocol
* semantic UI tools
* persistent UI state
* React renderer
* OpenAI adapter
* mock/demo flow
* whole-view replacement for v0
* stable widget IDs and semantic UI events

The next goal is to add an MCP integration layer without breaking the existing architecture.

The main architectural idea is:

```text
                    AgentUI
                       │
             ┌─────────┴─────────┐
             │                   │
        Direct SDK            MCP adapter
             │                   │
          OpenAI            MCP-capable hosts
                                 │
                         ┌───────┴───────┐
                         │               │
                      ChatGPT          Codex
```

The project should remain a UI capability, not become an agent framework.

## Main goal

Add a new package:

```text
@agentui/mcp
```

Its responsibility is to expose AgentUI semantic UI capabilities as MCP tools and, where appropriate, expose the corresponding interactive UI resources in a way compatible with MCP Apps / ChatGPT-style interactive components.

The long-term objective is that an MCP-capable model can discover tools such as:

```text
ui.form
ui.choice
ui.compare
ui.table
ui.diff
ui.confirm
ui.progress
ui.view.replace
```

and choose to use them when an interactive representation is more suitable than plain text.

The model should not need the user to explicitly say "show me a UI."

## Important constraint

Do not redesign `@agentui/core` around MCP.

MCP is an adapter.

The dependency direction should remain:

```text
@agentui/mcp
      ↓
@agentui/core
```

and never:

```text
@agentui/core
      ↓
MCP
```

The core protocol must remain transport-, renderer-, and provider-independent.

## First step: inspect the existing codebase

Before implementing anything, inspect the current monorepo and understand:

* current package structure
* widget/view model
* semantic tool definitions
* state management
* OpenAI adapter
* React renderer
* example application
* tool invocation flow
* UI event flow

Prefer reusing existing abstractions instead of introducing parallel representations.

If the current design has small inconsistencies that make MCP integration awkward, refactor them carefully, but do not rewrite the project unnecessarily.

## MCP package

Create:

```text
packages/mcp
```

with package name:

```json
{
  "name": "@agentui/mcp"
}
```

Use the official/current MCP TypeScript SDK where appropriate.

The package should provide a straightforward way to expose an existing AgentUI instance as an MCP server or MCP tool provider.

Target a developer experience conceptually similar to:

```ts
const ui = createAgentUI();

const server = createAgentUIMcpServer({
  ui
});

await server.start();
```

The exact API can differ if there is a cleaner design.

Also consider exposing a lower-level registration function:

```ts
registerAgentUITools(server, ui);
```

so consumers can mount AgentUI into an MCP server that already exposes unrelated tools.

This is important: AgentUI should be composable with an existing MCP server.

## Tool mapping

Reuse the semantic AgentUI tool definitions from the core or an appropriate shared abstraction.

Do not duplicate tool schemas manually if they already exist.

Map AgentUI tools into MCP tool definitions.

For example, conceptually:

```text
MCP tool call
    ↓
@agentui/mcp
    ↓
AgentUI semantic command
    ↓
@agentui/core
    ↓
UI state update
```

The MCP adapter should not contain rendering logic.

## Tool descriptions

Pay special attention to tool descriptions.

One of the key hypotheses of this project is that models can decide to create UI through normal tool reasoning, without special training.

Tool descriptions should therefore clearly state when each UI primitive is appropriate.

For example:

```text
ui.form

Present an interactive form when the user needs to provide several
related inputs or configuration choices. Use this when collecting the
inputs interactively is clearer or more efficient than asking a sequence
of conversational questions. The user does not need to explicitly
request a form.
```

Similarly:

```text
ui.compare

Present an interactive comparison when the user needs to evaluate
multiple alternatives across several criteria. Use this when interactive
comparison would be easier to understand than a long textual explanation.
```

And:

```text
ui.diff

Present proposed textual or code changes for interactive review.
Use this when the user needs to inspect, accept, reject, or reason about
changes.
```

Keep these descriptions concise enough for real tool use.

Do not encode a giant decision tree into the prompt.

## AgentUI guidance resource

Create a reusable short instruction/policy string that MCP hosts or examples can provide to the model where supported.

Conceptually:

```text
You have access to interactive AgentUI tools.

Use them when an interactive representation would make the user's task
clearer, faster, easier to understand, or easier to complete.

You do not need to wait for the user to explicitly request a GUI.

Prefer normal conversational text when an interactive interface would
not add meaningful value.
```

Keep this separate from the protocol itself.

## MCP Apps / interactive UI resources

Investigate the current MCP Apps / ChatGPT interactive component mechanism and implement the smallest standards-compatible path that allows the AgentUI React renderer to appear inside an MCP Apps-capable host.

Do not invent a proprietary protocol if MCP already provides the required mechanism.

The target conceptual flow is:

```text
Host/model
    ↓
calls AgentUI MCP tool
    ↓
MCP server updates AgentUI view state
    ↓
tool result references an interactive UI resource
    ↓
host renders AgentUI component
    ↓
user interacts
    ↓
UI event is delivered back
    ↓
host/model continues reasoning
```

The React renderer should remain the existing AgentUI renderer as much as possible.

Do not create separate widget implementations specifically for ChatGPT if the existing renderer can be reused.

## UI resource shell

If MCP Apps requires an HTML/JS resource, create a very small host shell that mounts:

```tsx
<AgentUI ... />
```

The shell should be responsible only for:

* bootstrapping the React renderer
* receiving AgentUI state from the host/server
* forwarding semantic UI events
* handling the MCP Apps bridge/protocol

Do not put AgentUI business logic into this shell.

## UI event model

Preserve the existing semantic event model.

For example:

```ts
type UIEvent =
  | { type: "click"; id: string }
  | { type: "change"; id: string; value: unknown }
  | { type: "submit"; id: string; values: Record<string, unknown> };
```

Map MCP/App bridge events into these AgentUI events.

Do not expose DOM events or React synthetic events to the core.

The desired direction is:

```text
browser event
    ↓
React renderer
    ↓
AgentUI semantic UIEvent
    ↓
MCP adapter / host
    ↓
model
```

## Avoid model-driven frame rendering

Maintain the existing architecture:

AgentUI should feel like an immediate-mode UI vocabulary from the model's perspective, but operate as a retained, event-driven UI at runtime.

The LLM should not redraw the view continuously.

A model tool call may create or replace a view.

The UI remains rendered locally until something meaningful happens.

Only semantic events should be sent back.

## MCP server modes

Ideally support two modes.

### Standalone server

A runnable MCP server useful for testing:

```bash
pnpm agentui-mcp
```

or an equivalent command.

It exposes the AgentUI tools directly.

### Embedded registration

Allow another application to add AgentUI tools to its existing MCP server.

For example:

```ts
const server = new McpServer(...);

registerAgentUITools(server, {
  ui
});

registerMyApplicationTools(server);
```

Do not force users to run a dedicated AgentUI server if they already have an MCP server.

## Examples

Add at least one dedicated example:

```text
examples/mcp
```

The example should work locally and demonstrate the AgentUI MCP server.

Prefer a scenario that clearly benefits from UI rather than a trivial button demo.

For example, expose a mock project configuration task.

A model should be able to invoke an AgentUI form representing:

```text
Project configuration

Language
[ TypeScript v ]

Runtime
[ Node.js v ]

[x] Tests
[x] Linting
[ ] Docker

[ Continue ]
```

Another useful example would be:

```text
Database comparison

PostgreSQL
SQLite
DynamoDB

Priorities:
Cost        [------]
Scale       [------]
Offline     [------]

[ Recalculate ]
```

The example should make it easy to test whether a model chooses the UI tool without an explicit GUI request.

## ChatGPT testing path

Document how the MCP example can be tested with ChatGPT Developer Mode / MCP Apps, according to the current supported OpenAI workflow.

Do not hardcode any tunnel vendor.

Explain conceptually that the local MCP endpoint needs to be made reachable over HTTPS for a remote host.

Document:

* how to start the local AgentUI MCP server
* expected MCP endpoint
* how to expose it externally for local testing
* how to register/connect it in ChatGPT
* which example prompts to try

Suggested test prompts:

```text
Help me configure a TypeScript backend project.
```

Expected behavior:
model should have a strong reason to use `ui.form`.

```text
Compare PostgreSQL, SQLite and DynamoDB for an offline-first application.
```

Expected behavior:
model may use `ui.compare`.

```text
Explain what dependency injection is.
```

Expected behavior:
plain text is probably preferable.

The README should emphasize that both correct activation and correct non-activation are important.

## Codex testing path

Document how the MCP server can be connected to Codex as an MCP tool provider according to the current Codex MCP configuration mechanism.

The objective for Codex is initially tool discovery and invocation.

Do not assume that every Codex host supports arbitrary MCP Apps rendering.

Clearly distinguish:

1. AgentUI MCP tools being callable by Codex.
2. A host being capable of rendering AgentUI interactive resources.

If interactive rendering is not supported by a particular Codex surface, document that limitation rather than introducing hacks.

Potential Codex test prompt:

```text
Review this repository and help me configure which checks should run
before a commit.
```

The model could potentially call an AgentUI form or selection tool.

## Keep direct OpenAI integration

Do not remove `@agentui/openai`.

We want to compare two integration paths:

```text
Application
   ↓
official OpenAI SDK
   ↓
@agentui/openai
```

versus:

```text
MCP-capable host
   ↓
MCP
   ↓
@agentui/mcp
```

They should share the same core protocol.

This comparison is part of the experiment.

## Package structure

The resulting monorepo should look approximately like:

```text
packages/
  core/
  openai/
  react/
  mcp/

examples/
  basic/
  mcp/
```

If MCP Apps requires a reusable browser package or bridge abstraction, only create another package if there is a clear architectural benefit. Avoid package proliferation for the PoC.

## Tests

Add tests for at least:

* semantic AgentUI tool -> MCP registration
* valid MCP tool invocation -> AgentUI state update
* invalid tool payload handling
* capability restrictions
* semantic UI event handling
* MCP adapter does not depend on React
* core does not depend on MCP
* tool descriptions are present
* stable view/widget IDs survive expected state transitions

Where practical, test MCP behavior without network sockets by invoking server/handler abstractions directly.

## Logging/debugging

Add lightweight debug logging useful while testing tool selection.

We want to be able to observe:

```text
model called ui.form
arguments validated
view created
view rendered
event submit received
event returned to host
```

Do not add a heavy logging framework.

A simple optional logger interface is sufficient.

## Security

Preserve the existing capability model.

The host should be able to expose only a subset of AgentUI tools:

```ts
createAgentUIMcpServer({
  ui,
  capabilities: [
    "form",
    "table",
    "compare",
    "confirm"
  ]
});
```

Do not support arbitrary HTML, JavaScript, or model-defined executable callbacks.

Buttons should emit semantic events only.

Privileged application actions must remain separate tools.

For example:

```text
ui.confirm(...)
```

may collect confirmation.

It should not itself perform:

```text
git.push
filesystem.delete
deploy.production
```

Those remain application capabilities.

## Do not overbuild

This phase is specifically about proving:

> AgentUI can be exposed as an MCP capability, discovered by an existing LLM host, and selected naturally through ordinary tool use.

Do not add:

* a new agent runtime
* complex layout engines
* visual UI designers
* persistence databases
* authentication systems
* arbitrary custom JavaScript
* plugin marketplaces
* a large component library
* Chat Completions compatibility
* complex incremental UI patching unless required by MCP

Keep whole-view replacement for now unless MCP integration reveals a compelling reason to change it.

## README

Update the main README with a concise architecture section:

```text
AgentUI is a renderer-independent interactive UI capability for LLMs.

Models access AgentUI through ordinary tools.

AgentUI can currently be exposed through:
- the OpenAI SDK adapter
- MCP

The model may choose between conversational output and interactive UI
based on the task.
```

Include a diagram showing:

```text
                    LLM
                     │
              semantic UI tools
                     │
                AgentUI Core
                     │
        ┌────────────┴────────────┐
        │                         │
     React renderer            future renderers
        │
        ▼
      user


Tool transport:

      OpenAI SDK          MCP
           \              /
            \            /
             AgentUI Core
```

Also explain the distinction between:

* tool transport
* UI protocol
* UI renderer
* application actions

## Definition of done

This phase is complete when:

1. `@agentui/mcp` exists and builds.
2. AgentUI semantic tools can be exposed by an MCP server.
3. MCP calls update the same AgentUI core state used by the existing renderer.
4. AgentUI can be embedded into an existing MCP server.
5. There is a runnable MCP example.
6. There is a documented ChatGPT testing path.
7. There is a documented Codex testing path.
8. At least one interactive MCP Apps-compatible rendering path works, if supported by the current standards/tooling.
9. No MCP-specific concepts have leaked into `@agentui/core`.
10. Existing OpenAI and React examples still work.
11. Tests pass.
12. The README clearly describes the architecture and experimental goal.

The central experiment is not merely "can an MCP tool show a form?"

It is:

> Can we give an existing general-purpose LLM a generic interactive UI vocabulary as MCP tools, and have the model discover when that vocabulary is a better way to interact with the user than plain conversation?

Keep the implementation focused on answering that question.

Proceed with the MCP implementation using the following decisions.

## 1. MCP transports: implement both

Support:

* **Streamable HTTP** as the primary/reference transport.
* **stdio** as a lightweight local transport.

Streamable HTTP is the important path because we want to test AgentUI with remote MCP hosts such as ChatGPT.

The standalone server should expose something like:

```text
http://localhost:3000/mcp
```

using the official MCP TypeScript SDK Streamable HTTP transport.

Also provide a stdio entry point for local MCP clients such as Codex-style developer workflows.

Avoid duplicating MCP/tool logic between the transports. Ideally:

```text
                 AgentUI MCP registration
                         |
              +----------+----------+
              |                     |
           stdio                Streamable HTTP
```

Both transports should instantiate/register the same AgentUI MCP server/tool set.

CLI ergonomics can be something simple such as:

```bash
pnpm agentui-mcp --stdio
```

and:

```bash
pnpm agentui-mcp --http --port 3000
```

or equivalent.

If one transport requires meaningfully more infrastructure, prioritize getting Streamable HTTP working first, then add stdio.

## 2. MCP Apps: implement the current standard path, not a proprietary bridge

Do not leave the MCP Apps mechanism abstract if the current official SDK/specification provides a concrete implementation path.

Use the current MCP Apps standard as the source of truth.

The intended mechanism is:

### Tool → UI association

Associate selected AgentUI MCP tools with a UI resource using:

```text
_meta.ui.resourceUri
```

Prefer the MCP Apps standard metadata rather than OpenAI-specific compatibility aliases.

OpenAI compatibility fields may be supported where trivial, but they should not become the canonical AgentUI representation.

### UI resource

Expose the React renderer shell as an MCP App resource with the MCP Apps UI MIME type:

```text
text/html;profile=mcp-app
```

Use the relevant helpers from the current MCP Apps / MCP TypeScript packages rather than hardcoding protocol details if helpers exist.

Conceptually:

```text
ui://agentui/view
```

may identify the AgentUI renderer resource.

The exact URI naming can be chosen during implementation, but keep it stable and versionable.

### Host/component communication

Use the MCP Apps `ui/*` JSON-RPC bridge over `postMessage`.

The component should use the standard bridge for:

* initialization
* receiving tool input
* receiving tool results
* invoking tools
* sending model-visible/follow-up messages where appropriate

Do not build a custom `window.parent.postMessage()` protocol alongside MCP Apps.

Use standard MCP Apps semantics first.

### State delivery

Treat AgentUI state as structured tool result/data.

The expected flow is conceptually:

```text
model
  ↓
ui.form / ui.compare / ui.view.replace
  ↓
AgentUI core state
  ↓
MCP tool result
  ↓
MCP Apps component receives state/result
  ↓
React renderer
```

Avoid creating an independent synchronization service unless it proves necessary.

For v0, prefer delivering enough view state with the tool result for the component to render deterministically.

### UI → host interaction

The browser component translates browser/React events into AgentUI semantic events.

When an event requires another model/tool turn, use the standard MCP Apps mechanism to call a tool or otherwise send the semantic action through the host.

The React component must never expose raw DOM or React events outside `@agentui/react`.

The flow remains:

```text
DOM event
   ↓
React renderer
   ↓
AgentUI UIEvent
   ↓
MCP Apps bridge
   ↓
MCP tool / host
   ↓
model when necessary
```

## 3. Tool naming

Keep the canonical AgentUI naming independent from MCP.

Canonical names in AgentUI core remain:

```text
ui.form
ui.choice
ui.compare
ui.table
ui.diff
ui.confirm
ui.progress
ui.view.replace
```

However, the MCP adapter must own external name mapping.

Do not assume every MCP host accepts dotted tool names.

Introduce an explicit mapping layer, conceptually:

```ts
canonicalName: "ui.form"
transportName: "ui_form"
```

The adapter should be able to map:

```text
ui.form         <-> ui_form
ui.compare      <-> ui_compare
ui.view.replace <-> ui_view_replace
```

Internally, always dispatch using the canonical name.

This keeps host-specific naming constraints out of the core protocol.

If current MCP tooling safely accepts dots across our target hosts, the adapter may preserve dotted names by default, but the mapping facility should still exist.

Do not scatter string replacement logic throughout the implementation.

## 4. Event semantics: distinguish local interaction from model-turn interaction

Do not send every UI event back to the LLM.

This is important.

Many UI interactions are merely local view-state changes and should remain in the renderer/core.

For v0 classify events approximately as follows.

### Local events by default

```text
change
focus
blur
expand
collapse
tab_change
slider_change
text_edit
selection_change
```

These update local AgentUI state but do not automatically trigger another model inference.

For example:

```ts
{
  type: "change",
  id: "replicas",
  value: 4
}
```

should normally just update local state.

Changing a slider should not invoke the LLM every time the pointer moves.

### Model-turn events

The following normally represent meaningful user intent and should be eligible to return to the agent/model:

```text
submit
confirm
cancel
action
```

Examples:

```ts
{
  type: "submit",
  id: "deployment-form",
  values: { ... }
}
```

```ts
{
  type: "confirm",
  id: "delete-files"
}
```

```ts
{
  type: "action",
  id: "explain-option",
  action: "explain"
}
```

Button clicks should therefore not automatically mean “call the model.”

A button should carry semantic intent.

For example:

```ts
{
  id: "deploy",
  type: "button",
  label: "Deploy",
  action: {
    mode: "model",
    name: "deploy"
  }
}
```

or use a cleaner equivalent if one fits the existing protocol better.

The important distinction is:

```text
local interaction
vs.
agent interaction
```

## 5. Allow explicit event policy

Design widgets/events so that the default event behavior can later be overridden.

Conceptually:

```ts
eventPolicy: "local"
```

or:

```ts
eventPolicy: "model"
```

Possibly later:

```ts
eventPolicy: "live"
```

Do not overbuild this, but avoid baking in the assumption that `change` can never reach the model.

For example, a future search/autocomplete control might legitimately request agent involvement when its value changes.

For v0:

```text
change → local by default
submit → model
confirm → model
cancel → model
explicit action button → model
```

is sufficient.

## 6. Forms should batch interaction

One reason AgentUI exists is to avoid repeated conversational round trips.

Therefore:

```text
change input A
change input B
toggle checkbox C
select option D
```

should normally remain local.

Then:

```text
Submit
```

produces one semantic event containing the complete relevant form state:

```ts
{
  type: "submit",
  id: "project-config",
  values: {
    language: "typescript",
    tests: true,
    docker: false
  }
}
```

This is preferable to four separate model calls.

Treat this as a fundamental AgentUI interaction principle.

## 7. MCP Apps fallback behavior

AgentUI MCP tools must remain useful when the host does not support MCP Apps UI rendering.

Do not make a tool's semantic result dependent on an iframe being available.

The tool result should include sufficient structured/text information that a non-UI host can still understand what happened and continue the workflow.

Therefore:

```text
MCP tool
 ├── structured semantic result
 └── optional associated UI resource
```

not:

```text
MCP tool
 └── opaque UI-only result
```

## 8. ChatGPT-specific extensions

Do not design around `window.openai`.

Build the portable MCP Apps implementation first.

If ChatGPT exposes useful additional capabilities, use them only through feature detection and only as optional enhancements.

The portable architecture must remain:

```text
MCP Apps
   ↓
AgentUI
```

rather than:

```text
ChatGPT-specific API
   ↓
AgentUI
```

## 9. Implementation order

Use this order:

1. Refactor/share MCP-independent semantic AgentUI tool definitions if necessary.
2. Implement MCP tool registration.
3. Implement Streamable HTTP server.
4. Verify with MCP Inspector.
5. Add stdio transport using the same registration layer.
6. Implement MCP Apps UI resource.
7. Connect existing React renderer to MCP Apps bridge.
8. Implement semantic UI event classification.
9. Verify local-only events do not trigger model turns.
10. Verify submit/confirm/action events can return through the MCP workflow.
11. Test with ChatGPT Developer Mode.
12. Test MCP tool discovery/invocation with Codex.
13. Document differences between hosts that render MCP Apps and hosts that only support MCP tools.

## 10. Architectural invariant

Keep these four layers separate:

```text
Transport
  stdio / Streamable HTTP

        ↓

MCP adapter
  naming / schemas / MCP Apps integration

        ↓

AgentUI core
  views / widgets / semantic state / UI events

        ↓

Renderer
  React today, others later
```

No transport details in core.

No React details in core.

No model-provider details in core.

No MCP-specific event objects in the React renderer.

## 11. Primary experiment

Keep the implementation focused on testing this hypothesis:

> A general-purpose LLM can discover AgentUI as a set of MCP tools and choose an interactive interface when that interface is a better interaction modality than plain conversation.

The secondary experiment is equally important:

> Once the UI exists, most low-level user interaction should happen locally without repeatedly involving the LLM.

That means AgentUI should reduce conversational round trips rather than turn every checkbox and slider movement into another agent call.

Implement these decisions directly. Only stop for clarification if the current MCP SDK/spec makes one of them technically impossible.


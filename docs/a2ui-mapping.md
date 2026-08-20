# AgentUI to A2UI Mapping

This project now treats A2UI v1.0 Candidate as the standard declarative UI representation underneath AgentUI semantic tools.

Sources inspected:

- A2UI v1.0 protocol specification: https://github.com/a2ui-project/a2ui/blob/main/specification/v1_0/docs/a2ui_protocol.md
- A2UI Basic Catalog schema: https://raw.githubusercontent.com/a2ui-project/a2ui/main/specification/v1_0/catalogs/basic/catalog.json
- A2UI renderer guidance: https://a2ui.org/guides/renderer-development/
- A2UI renderer list: https://a2ui.org/reference/renderers/

## Key A2UI Concepts

- A2UI is a transport-agnostic stream of JSON messages.
- v1.0 messages include `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface`.
- A surface is identified by `surfaceId`; the `root` component is mounted under the canonical Surface container.
- Components are a flat adjacency list. Parent components reference child component IDs.
- Data binding uses dynamic values, commonly `{ "path": "/json/pointer" }`, against a surface data model.
- User interactions return through a transport-specific action/function channel rather than by mutating the A2UI stream directly.
- Standard components come from catalogs. The Basic Catalog includes `Text`, `Row`, `Column`, `Card`, `Divider`, `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `Tabs`, and related components.
- Custom components should be introduced through catalog/renderer extension mechanisms, not by forking the A2UI protocol.

## Mapping

| Current AgentUI concept | A2UI equivalent | Notes |
| --- | --- | --- |
| `AgentUIState.views` | Collection of A2UI surfaces | Each `View` now carries an `a2ui` surface document. Legacy `children` remain as a transitional compatibility model. |
| `View.id` | `surfaceId` | Preserved directly. |
| `View.title` | Usually a `Text` component near root | A2UI surfaces do not require a separate title field. |
| `Widget[]` tree | A2UI flat component adjacency list | `widgetsToA2UI` converts legacy widgets into a `root` `Column` plus referenced children. |
| `TextWidget` / `MarkdownWidget` | Basic Catalog `Text` | Markdown remains plain text/limited markdown per Basic Catalog guidance. |
| `ButtonWidget` | Basic Catalog `Button` + child `Text` | AgentUI keeps local/model event policy separately. |
| `InputWidget` | Basic Catalog `TextField` | Values bind to `/values/{id}`. |
| `CheckboxWidget` | Basic Catalog `CheckBox` | Values bind to `/values/{id}`. |
| `SelectWidget` | Basic Catalog `ChoicePicker` | Single-select values are represented as string arrays because A2UI `ChoicePicker.value` is `DynamicStringList`. |
| `FormWidget` | `Column` of fields + `Row` of `Button`s | Local edits are batched into one `submit` semantic event. |
| `TableWidget` | `agentui.Table` extension component | No direct Basic Catalog table primitive was used in this migration slice. |
| `DiffWidget` | `agentui.Diff` extension component | Preserves AgentUI review semantics as a renderer extension. |
| `PlotWidget` | `agentui.Plot` extension component | Numeric plotting remains an AgentUI extension until a standard chart/table catalog is adopted. |
| `ConfirmationWidget` | `Text` + action `Button`s | Confirm/cancel remain model-turn semantic events. |
| `TabsWidget` | Basic Catalog `Tabs` | Tab children are converted into referenced `Column` components. |
| `ContainerWidget` | Basic Catalog `Column` | Legacy nested containers compile to A2UI layout components. |
| `SeparatorWidget` | Basic Catalog `Divider` | Direct mapping. |
| `WasmAppletWidget` | `agentui.WasmApplet` extension component | A2UI describes the applet container/config; WASM owns executable local interaction. |
| `UIEvent` | Transport action/function result interpreted by AgentUI | `a2uiActionToUIEvent` maps A2UI-style actions into AgentUI semantic events. |
| Local-vs-model policy | AgentUI runtime policy over returned actions | A2UI describes interaction; AgentUI decides whether an event stays local or returns to the model. |
| MCP/OpenAI adapters | Transports carrying semantic tools and A2UI-backed state | A2UI remains provider-independent. |

## Gaps / Non-Direct Equivalents

- AgentUI semantic tools are intentionally higher-level than A2UI. The model should usually call `ui.form`, `ui.table`, `ui.diff`, `ui.confirm`, or `ui.applet-pong`, not hand-author low-level A2UI.
- A2UI v1.0 is candidate while production releases are still in the v0.9 family. The core types here target the v1.0 candidate envelope because it has the clearest surface/message model.
- The current React and MCP renderers implement the A2UI subset needed by AgentUI plus AgentUI extension components. They do not claim to be complete A2UI renderers.
- Generic WASM applet loading is host-dependent. The current default model-facing tool is `ui.applet-pong` because ChatGPT Desktop's MCP resource bundles only the Pong applet.

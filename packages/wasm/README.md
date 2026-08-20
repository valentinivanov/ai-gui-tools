# @agentui/wasm

Experimental AgentUI runtime for sandboxed browser WebAssembly applets.

This package is an escape hatch for interactions that are too spatial, stateful, or frame-driven for ordinary declarative AgentUI widgets. It is not a replacement for forms, tables, choices, plots, diffs, confirmations, or normal text.

## Model

```text
LLM
  -> ui.applet(...) or a prebuilt applet tool such as ui.applet-pong
  -> AgentUI renderer-independent wasm-applet widget
  -> @agentui/wasm browser host
  -> Web Worker
  -> WebAssembly module
  -> canvas draw commands
```

Pointer, keyboard, animation, and game-loop frames stay local. Only meaningful applet events such as `game_over`, `level_completed`, `ask_ai`, `apply`, or `cancel` are emitted back to AgentUI as semantic events.

## Capabilities

v0 supports only:

- `canvas`
- `pointer`
- `keyboard`
- `timer`
- `emit_event`

The host does not provide network, filesystem, clipboard, DOM, cookies, local storage, arbitrary JavaScript imports, or host application APIs.

## ABI

Modules may export these lifecycle functions:

```text
init(width, height)
resize(width, height)
update(deltaMs)
pointer_event(kind, pointerId, x, y, button)
key_event(kind, code, repeat)
destroy()
```

The host provides imports under the `agentui` namespace:

```text
abi_version()
clear(rgba)
draw_rect(x, y, width, height, rgba)
draw_circle(x, y, radius, rgba)
draw_line(x1, y1, x2, y2, width, rgba)
draw_text(ptr, len, x, y, size, rgba)
emit_event(ptr, len)
```

`draw_text` and `emit_event` read UTF-8 bytes from linear memory. `emit_event` expects JSON like:

```json
{"type":"level_completed","payload":{"score":4200}}
```

## Resource Safety

The browser implementation validates module bytes with `WebAssembly.validate`, enforces module byte limits and canvas dimension limits, runs the module in a Web Worker, and terminates that worker on lifecycle cleanup.

Browser-native WebAssembly does not provide reliable instruction-count CPU preemption inside a single exported function. Running in a worker prevents UI-thread freezes and lets the host terminate the worker after detection, but a synchronous runaway export may still run until the worker is terminated.

## AssemblyScript Example

The first generated-app pipeline is isolated in `examples/applets/pong`:

```text
AssemblyScript source
  -> asc compiler
  -> dist/applet.wasm
  -> AgentUI WasmApplet runtime
```

Build it with:

```bash
pnpm applet:build
```

The runtime consumes normal `.wasm` artifacts and does not depend on AssemblyScript. Future applets can target the same ABI from Rust, C, C++, Zig, or other WebAssembly-producing languages.

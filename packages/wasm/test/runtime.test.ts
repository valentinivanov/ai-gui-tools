import { describe, expect, it, vi } from "vitest";
import {
  appletHostImportNames,
  createBrowserWasmAppletRuntime,
  validateAppletManifest,
  validateModuleBytes,
  type DrawCommand
} from "../src/index.js";

const validWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

class FakeWorker {
  onmessage: ((message: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  send(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

describe("@agentui/wasm runtime", () => {
  it("accepts a valid WASM module", () => {
    expect(() => validateModuleBytes(validWasm)).not.toThrow();
  });

  it("rejects an invalid module", () => {
    expect(() => validateModuleBytes(new Uint8Array([1, 2, 3]))).toThrow("Invalid WebAssembly module");
  });

  it("rejects unsupported capabilities", () => {
    expect(() =>
      validateAppletManifest({
        id: "bad",
        module: { bytes: validWasm },
        capabilities: ["network" as "canvas"]
      })
    ).toThrow("Unsupported WASM applet capability");
  });

  it("forwards lifecycle messages to the worker and terminates it", async () => {
    const worker = new FakeWorker();
    const statuses: string[] = [];
    const runtime = createBrowserWasmAppletRuntime(
      { onStatus: (status) => statuses.push(status) },
      { workerFactory: () => worker as unknown as Worker }
    );

    await runtime.load({
      id: "pong",
      module: { bytes: validWasm },
      width: 320,
      height: 180,
      capabilities: ["canvas", "timer"]
    });
    runtime.resize(640, 360);
    runtime.update(16);
    runtime.destroy();

    expect(statuses).toContain("loading");
    expect(worker.messages.map((message) => (message as { type: string }).type)).toEqual(["load", "resize", "update", "destroy"]);
    expect(worker.terminated).toBe(true);
  });

  it("emits semantic applet events from worker messages", async () => {
    const worker = new FakeWorker();
    const listener = vi.fn();
    const runtime = createBrowserWasmAppletRuntime(
      { onEvent: listener },
      { workerFactory: () => worker as unknown as Worker }
    );

    await runtime.load({
      id: "pong",
      module: { bytes: validWasm },
      capabilities: ["emit_event"]
    });
    worker.send({ type: "event", event: { type: "game_over", payload: { score: 4 } } });

    expect(listener).toHaveBeenCalledWith({ type: "game_over", payload: { score: 4 } });
  });

  it("forwards frame draw commands", async () => {
    const worker = new FakeWorker();
    const frames: DrawCommand[][] = [];
    const runtime = createBrowserWasmAppletRuntime(
      { onFrame: (commands) => frames.push(commands) },
      { workerFactory: () => worker as unknown as Worker }
    );

    await runtime.load({
      id: "diagram",
      module: { bytes: validWasm },
      capabilities: ["canvas"]
    });
    worker.send({ type: "frame", commands: [{ op: "clear", color: "#ffffff" }] });

    expect(frames).toEqual([[{ op: "clear", color: "#ffffff" }]]);
  });

  it("does not expose network imports by default", () => {
    expect(appletHostImportNames).not.toContain("fetch");
    expect(appletHostImportNames).not.toContain("network");
    expect(appletHostImportNames).not.toContain("eval");
  });
});

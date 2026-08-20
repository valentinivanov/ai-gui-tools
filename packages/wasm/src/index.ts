export const APPLET_ABI_VERSION = 1;

export const defaultAppletLimits = {
  maxModuleBytes: 1024 * 1024,
  maxWidth: 1920,
  maxHeight: 1080,
  maxInitialMemoryPages: 16,
  frameTimeoutMs: 250
} as const;

export const appletHostImportNames = [
  "abi_version",
  "clear",
  "draw_rect",
  "draw_circle",
  "draw_line",
  "draw_text",
  "emit_event"
] as const;

export type AppletCapability = "canvas" | "pointer" | "keyboard" | "timer" | "emit_event";

export interface WasmAppletModuleSource {
  url?: string | undefined;
  bytes?: Uint8Array | ArrayBuffer | undefined;
  hash?: string | undefined;
}

export interface WasmAppletHostLimits {
  maxModuleBytes?: number | undefined;
  maxWidth?: number | undefined;
  maxHeight?: number | undefined;
  maxInitialMemoryPages?: number | undefined;
  frameTimeoutMs?: number | undefined;
}

interface ResolvedWasmAppletHostLimits {
  maxModuleBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxInitialMemoryPages: number;
  frameTimeoutMs: number;
}

export interface WasmAppletManifest {
  id: string;
  module: WasmAppletModuleSource;
  width?: number | undefined;
  height?: number | undefined;
  capabilities: AppletCapability[];
  initialState?: unknown;
  limits?: WasmAppletHostLimits | undefined;
}

export interface AppletSemanticEvent {
  type: string;
  payload?: unknown;
}

export type AppletPointerEventType = "down" | "move" | "up" | "cancel";

export interface AppletPointerEvent {
  type: AppletPointerEventType;
  pointerId: number;
  x: number;
  y: number;
  button: number;
}

export interface AppletKeyEvent {
  type: "down" | "up";
  key: string;
  code: string;
  repeat: boolean;
}

export type DrawCommand =
  | { op: "clear"; color: string }
  | { op: "rect"; x: number; y: number; width: number; height: number; color: string }
  | { op: "circle"; x: number; y: number; radius: number; color: string }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; width: number; color: string }
  | { op: "text"; x: number; y: number; text: string; color: string; size: number };

export interface WasmAppletRuntimeEvents {
  onFrame?(commands: DrawCommand[]): void;
  onEvent?(event: AppletSemanticEvent): void;
  onError?(error: Error): void;
  onStatus?(status: "loading" | "ready" | "destroyed"): void;
}

export interface WasmAppletRuntime {
  load(manifest: WasmAppletManifest): Promise<void>;
  resize(width: number, height: number): void;
  update(deltaMs: number): void;
  pointer(event: AppletPointerEvent): void;
  key(event: AppletKeyEvent): void;
  destroy(): void;
}

type WorkerFactory = (url: string | URL) => Worker;

interface RuntimeOptions {
  workerFactory?: WorkerFactory | undefined;
  fetchBytes?: ((url: string) => Promise<ArrayBuffer>) | undefined;
}

interface WorkerFrameMessage {
  type: "frame";
  commands: DrawCommand[];
}

interface WorkerReadyMessage {
  type: "ready";
}

interface WorkerSemanticMessage {
  type: "event";
  event: AppletSemanticEvent;
}

interface WorkerErrorMessage {
  type: "error";
  message: string;
}

type WorkerToHostMessage = WorkerFrameMessage | WorkerReadyMessage | WorkerSemanticMessage | WorkerErrorMessage;

export function validateAppletManifest(manifest: WasmAppletManifest): void {
  if (!manifest.id) throw new Error("WASM applet id is required");
  validateCapabilities(manifest.capabilities);
  const limits = mergedLimits(manifest.limits);
  validateDimensions(manifest.width ?? 640, manifest.height ?? 360, limits);
  if (!manifest.module.url && !manifest.module.bytes) {
    throw new Error("WASM applet module requires url or bytes");
  }
  if (manifest.module.bytes) {
    validateModuleBytes(toUint8Array(manifest.module.bytes), limits);
  }
}

export function validateModuleBytes(bytes: Uint8Array<ArrayBuffer>, limits: ResolvedWasmAppletHostLimits = mergedLimits()): void {
  if (bytes.byteLength === 0) throw new Error("WASM module is empty");
  if (bytes.byteLength > limits.maxModuleBytes) throw new Error(`WASM module exceeds ${limits.maxModuleBytes} bytes`);
  if (!WebAssembly.validate(bytes)) throw new Error("Invalid WebAssembly module");
}

export function createBrowserWasmAppletRuntime(events: WasmAppletRuntimeEvents, options: RuntimeOptions = {}): WasmAppletRuntime {
  return new BrowserWasmAppletRuntime(events, options);
}

export function renderDrawCommands(context: CanvasRenderingContext2D, commands: DrawCommand[]): void {
  for (const command of commands) {
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
    } else {
      context.fillStyle = command.color;
      context.font = `${command.size}px ui-sans-serif, system-ui, sans-serif`;
      context.fillText(command.text, command.x, command.y);
    }
    context.restore();
  }
}

class BrowserWasmAppletRuntime implements WasmAppletRuntime {
  #events: WasmAppletRuntimeEvents;
  #workerFactory: WorkerFactory;
  #fetchBytes: (url: string) => Promise<ArrayBuffer>;
  #worker: Worker | undefined;
  #limits: ResolvedWasmAppletHostLimits = mergedLimits();

  constructor(events: WasmAppletRuntimeEvents, options: RuntimeOptions) {
    this.#events = events;
    this.#workerFactory = options.workerFactory ?? ((url) => new Worker(url, { type: "module" }));
    this.#fetchBytes = options.fetchBytes ?? defaultFetchBytes;
  }

  async load(manifest: WasmAppletManifest): Promise<void> {
    this.destroy();
    validateAppletManifest(manifest);
    this.#limits = mergedLimits(manifest.limits);
    this.#events.onStatus?.("loading");

    const bytes = await this.#loadBytes(manifest.module);
    validateModuleBytes(bytes, this.#limits);

    this.#worker = this.#workerFactory(workerUrl());
    this.#worker.onmessage = (message: MessageEvent<WorkerToHostMessage>) => this.#handleMessage(message.data);
    this.#worker.onerror = (event) => this.#events.onError?.(new Error(event.message));
    this.#worker.postMessage({
      type: "load",
      manifest: {
        id: manifest.id,
        width: manifest.width ?? 640,
        height: manifest.height ?? 360,
        capabilities: manifest.capabilities,
        initialState: manifest.initialState,
        limits: this.#limits
      },
      bytes
    }, [bytes.buffer]);
  }

  resize(width: number, height: number): void {
    validateDimensions(width, height, this.#limits);
    this.#worker?.postMessage({ type: "resize", width, height });
  }

  update(deltaMs: number): void {
    this.#worker?.postMessage({ type: "update", deltaMs });
  }

  pointer(event: AppletPointerEvent): void {
    this.#worker?.postMessage({ type: "pointer", event });
  }

  key(event: AppletKeyEvent): void {
    this.#worker?.postMessage({ type: "key", event });
  }

  destroy(): void {
    this.#worker?.postMessage({ type: "destroy" });
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#events.onStatus?.("destroyed");
  }

  async #loadBytes(module: WasmAppletModuleSource): Promise<Uint8Array<ArrayBuffer>> {
    if (module.bytes) return toUint8Array(module.bytes);
    if (!module.url) throw new Error("WASM applet module URL is missing");
    return new Uint8Array(await this.#fetchBytes(module.url));
  }

  #handleMessage(message: WorkerToHostMessage): void {
    if (message.type === "ready") {
      this.#events.onStatus?.("ready");
    } else if (message.type === "frame") {
      this.#events.onFrame?.(message.commands);
    } else if (message.type === "event") {
      this.#events.onEvent?.(message.event);
    } else {
      this.#events.onError?.(new Error(message.message));
    }
  }
}

function validateCapabilities(capabilities: AppletCapability[]): void {
  const allowed = new Set<AppletCapability>(["canvas", "pointer", "keyboard", "timer", "emit_event"]);
  for (const capability of capabilities) {
    if (!allowed.has(capability)) throw new Error(`Unsupported WASM applet capability: ${capability}`);
  }
}

function validateDimensions(width: number, height: number, limits: ResolvedWasmAppletHostLimits): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("WASM applet dimensions must be positive numbers");
  }
  if (width > limits.maxWidth || height > limits.maxHeight) {
    throw new Error(`WASM applet dimensions exceed ${limits.maxWidth}x${limits.maxHeight}`);
  }
}

function mergedLimits(limits: WasmAppletHostLimits = {}): ResolvedWasmAppletHostLimits {
  return {
    maxModuleBytes: limits.maxModuleBytes ?? defaultAppletLimits.maxModuleBytes,
    maxWidth: limits.maxWidth ?? defaultAppletLimits.maxWidth,
    maxHeight: limits.maxHeight ?? defaultAppletLimits.maxHeight,
    maxInitialMemoryPages: limits.maxInitialMemoryPages ?? defaultAppletLimits.maxInitialMemoryPages,
    frameTimeoutMs: limits.frameTimeoutMs ?? defaultAppletLimits.frameTimeoutMs
  };
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array<ArrayBuffer> {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

async function defaultFetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load WASM applet module: ${response.status}`);
  return response.arrayBuffer();
}

let cachedWorkerUrl: string | undefined;

function workerUrl(): string {
  if (cachedWorkerUrl) return cachedWorkerUrl;
  const blob = new Blob([workerSource], { type: "text/javascript" });
  cachedWorkerUrl = URL.createObjectURL(blob);
  return cachedWorkerUrl;
}

const workerSource = `
let instance;
let memory;
let exportsObject;
let commands = [];
let capabilities = new Set();
const decoder = new TextDecoder();

const text = (ptr, len) => {
  if (!memory) return "";
  return decoder.decode(new Uint8Array(memory.buffer, ptr, len));
};

const color = (value) => "#" + (value >>> 0).toString(16).padStart(8, "0").slice(0, 6);

const imports = {
  env: {
    abort: (messagePtr, filePtr, line, column) => {
      throw new Error("WASM applet aborted at " + line + ":" + column);
    }
  },
  agentui: {
    abi_version: () => ${APPLET_ABI_VERSION},
    clear: (rgba) => {
      if (capabilities.has("canvas")) commands.push({ op: "clear", color: color(rgba) });
    },
    draw_rect: (x, y, width, height, rgba) => {
      if (capabilities.has("canvas")) commands.push({ op: "rect", x, y, width, height, color: color(rgba) });
    },
    draw_circle: (x, y, radius, rgba) => {
      if (capabilities.has("canvas")) commands.push({ op: "circle", x, y, radius, color: color(rgba) });
    },
    draw_line: (x1, y1, x2, y2, width, rgba) => {
      if (capabilities.has("canvas")) commands.push({ op: "line", x1, y1, x2, y2, width, color: color(rgba) });
    },
    draw_text: (ptr, len, x, y, size, rgba) => {
      if (capabilities.has("canvas")) commands.push({ op: "text", x, y, size, color: color(rgba), text: text(ptr, len) });
    },
    emit_event: (ptr, len) => {
      if (!capabilities.has("emit_event")) return;
      try {
        const event = JSON.parse(text(ptr, len));
        if (event && typeof event.type === "string") postMessage({ type: "event", event });
      } catch (error) {
        postMessage({ type: "error", message: error instanceof Error ? error.message : "Invalid applet event" });
      }
    }
  }
};

const call = (name, ...args) => {
  const fn = exportsObject && exportsObject[name];
  if (typeof fn === "function") fn(...args);
};

const flush = () => {
  if (commands.length > 0) {
    postMessage({ type: "frame", commands });
    commands = [];
  }
};

onmessage = async (message) => {
  try {
    const data = message.data;
    if (data.type === "load") {
      capabilities = new Set(data.manifest.capabilities);
      const module = await WebAssembly.compile(data.bytes);
      instance = await WebAssembly.instantiate(module, imports);
      exportsObject = instance.exports;
      memory = exportsObject.memory instanceof WebAssembly.Memory ? exportsObject.memory : undefined;
      const memoryPages = memory ? memory.buffer.byteLength / 65536 : 0;
      if (memoryPages > data.manifest.limits.maxInitialMemoryPages) {
        throw new Error("WASM applet initial memory exceeds host limit");
      }
      call("init", data.manifest.width, data.manifest.height);
      postMessage({ type: "ready" });
      flush();
    } else if (data.type === "resize") {
      call("resize", data.width, data.height);
      flush();
    } else if (data.type === "update") {
      call("update", data.deltaMs);
      flush();
    } else if (data.type === "pointer" && capabilities.has("pointer")) {
      const event = data.event;
      const type = event.type === "down" ? 1 : event.type === "move" ? 2 : event.type === "up" ? 3 : 4;
      call("pointer_event", type, event.pointerId, event.x, event.y, event.button);
      flush();
    } else if (data.type === "key" && capabilities.has("keyboard")) {
      const key = data.event;
      call("key_event", key.type === "down" ? 1 : 2, keyCode(key.code), key.repeat ? 1 : 0);
      flush();
    } else if (data.type === "destroy") {
      call("destroy");
      instance = undefined;
      exportsObject = undefined;
      memory = undefined;
      commands = [];
    }
  } catch (error) {
    postMessage({ type: "error", message: error instanceof Error ? error.message : "WASM applet worker error" });
  }
};

const keyCode = (code) => {
  if (code === "ArrowLeft") return 37;
  if (code === "ArrowRight") return 39;
  if (code === "ArrowUp") return 38;
  if (code === "ArrowDown") return 40;
  if (code.startsWith("Key") && code.length === 4) return code.charCodeAt(3);
  if (code.startsWith("Digit") && code.length === 6) return code.charCodeAt(5);
  return code.length > 0 ? code.charCodeAt(0) : 0;
};
`;

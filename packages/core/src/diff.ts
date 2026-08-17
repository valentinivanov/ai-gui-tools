import type { AgentUICommand, DiffFile, View, Widget } from "./types.js";

type DynamicImport = (specifier: string) => Promise<unknown>;

const dynamicImport = new Function("specifier", "return import(specifier)") as DynamicImport;

export async function populateComputedDiffs(command: AgentUICommand): Promise<AgentUICommand> {
  if (command.type !== "replace_view") return command;
  return {
    ...command,
    view: await populateViewDiffs(command.view)
  };
}

async function populateViewDiffs(view: View): Promise<View> {
  return {
    ...view,
    children: await Promise.all(view.children.map(populateWidgetDiffs))
  };
}

async function populateWidgetDiffs(widget: Widget): Promise<Widget> {
  if (widget.type === "diff") {
    return {
      ...widget,
      files: await Promise.all(widget.files.map(populateFileDiff))
    };
  }

  if (widget.type === "container") {
    return {
      ...widget,
      children: await Promise.all(widget.children.map(populateWidgetDiffs))
    };
  }

  if (widget.type === "tabs") {
    return {
      ...widget,
      tabs: await Promise.all(
        widget.tabs.map(async (tab) => ({
          ...tab,
          children: await Promise.all(tab.children.map(populateWidgetDiffs))
        }))
      )
    };
  }

  return widget;
}

async function populateFileDiff(file: DiffFile): Promise<DiffFile> {
  if (file.patch || typeof file.oldText !== "string" || typeof file.newText !== "string") {
    return file;
  }

  const patch = await runUnifiedDiff(file.path, file.oldText, file.newText);
  return patch ? { ...file, patch } : file;
}

async function runUnifiedDiff(pathLabel: string, oldText: string, newText: string): Promise<string | undefined> {
  let tmpdir: string | undefined;

  try {
    const [{ spawn }, fs, os, path] = (await Promise.all([
      dynamicImport("node:child_process"),
      dynamicImport("node:fs/promises"),
      dynamicImport("node:os"),
      dynamicImport("node:path")
    ])) as [
      { spawn: (command: string, args: string[]) => ChildProcessLike },
      FsPromisesLike,
      OsLike,
      PathLike
    ];

    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "agentui-diff-"));
    const oldPath = path.join(tmpdir, "before");
    const newPath = path.join(tmpdir, "after");
    await fs.writeFile(oldPath, oldText, "utf8");
    await fs.writeFile(newPath, newText, "utf8");

    const output = await spawnAndCapture(spawn, "diff", ["-u", "--label", `before/${pathLabel}`, "--label", `after/${pathLabel}`, oldPath, newPath]);
    return output.trim().length > 0 ? output : "No differences.";
  } catch {
    return undefined;
  } finally {
    if (tmpdir) {
      try {
        const fs = (await dynamicImport("node:fs/promises")) as FsPromisesLike;
        await fs.rm(tmpdir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; diff generation still falls back safely.
      }
    }
  }
}

function spawnAndCapture(spawn: (command: string, args: string[]) => ChildProcessLike, command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("diff timed out"));
    }, 2_000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || code === 1) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `diff exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

interface ChildProcessLike {
  stdout: EventEmitterLike;
  stderr: EventEmitterLike;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number | null) => void): void;
  kill(): void;
}

interface EventEmitterLike {
  on(event: "data", listener: (chunk: unknown) => void): void;
}

interface FsPromisesLike {
  mkdtemp(prefix: string): Promise<string>;
  writeFile(path: string, data: string, encoding: string): Promise<void>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
}

interface OsLike {
  tmpdir(): string;
}

interface PathLike {
  join(...parts: string[]): string;
}

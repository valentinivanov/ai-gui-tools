import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../..", import.meta.url).pathname;

describe("package boundaries", () => {
  it("@agentui/mcp does not depend on React", () => {
    const packageJson = JSON.parse(readFileSync(join(root, "packages/mcp/package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["@agentui/react"]).toBeUndefined();
    expect(packageJson.dependencies?.react).toBeUndefined();
  });

  it("@agentui/core does not depend on MCP", () => {
    const files = ["package.json", "src/agent-ui.ts", "src/tools.ts", "src/types.ts", "src/events.ts"].map((file) =>
      readFileSync(join(root, "packages/core", file), "utf8")
    );

    expect(files.join("\n")).not.toContain("@modelcontextprotocol");
  });
});

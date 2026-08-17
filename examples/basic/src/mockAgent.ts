import type { AgentUI, UIEvent } from "@agentui/core";

export async function runMockTurn(ui: AgentUI, input: string): Promise<string> {
  const normalized = input.toLowerCase();

  if (normalized.includes("deploy") || normalized.includes("configure")) {
    await ui.handleToolCall("ui.form", {
      viewId: "deployment",
      title: "Deployment",
      description: "Choose deployment settings before continuing.",
      fields: [
        {
          type: "select",
          id: "environment",
          label: "Environment",
          options: [
            { label: "Production", value: "production" },
            { label: "Staging", value: "staging" },
            { label: "Development", value: "development" }
          ],
          value: "production"
        },
        { type: "input", id: "replicas", label: "Replicas", inputType: "number", value: 3 },
        { type: "checkbox", id: "autoscaling", label: "Autoscaling", checked: true },
        { type: "checkbox", id: "publicIngress", label: "Public ingress", checked: false }
      ],
      submitLabel: "Deploy",
      cancelLabel: "Cancel"
    });
    return "I opened an interactive deployment form. Submit it when the settings look right.";
  }

  if (normalized.includes("postgres") || normalized.includes("dynamodb") || normalized.includes("sqlite")) {
    await ui.handleToolCall("ui.table", {
      viewId: "database-comparison",
      title: "Database comparison",
      columns: [
        { key: "item", label: "Option" },
        { key: "cost", label: "Cost" },
        { key: "scale", label: "Scale" },
        { key: "ops", label: "Ops" },
        { key: "offline", label: "Offline" }
      ],
      rows: [
        { item: "Postgres", cost: "Medium", scale: "High", ops: "Medium", offline: "No" },
        { item: "DynamoDB", cost: "Usage-based", scale: "Very high", ops: "Low", offline: "No" },
        { item: "SQLite", cost: "Low", scale: "Low-medium", ops: "Very low", offline: "Yes" }
      ]
    });
    return "I put the database options in a comparison table so the tradeoffs are easier to scan.";
  }

  if (normalized.includes("diff") || normalized.includes("review")) {
    await ui.handleToolCall("ui.diff", {
      viewId: "review",
      title: "Proposed changes",
      files: [
        {
          path: "src/network.ts",
          patch: "- timeout: 1000\n+ timeout: 5000\n+ retry: { attempts: 2 }"
        },
        {
          path: "test/network.test.ts",
          patch: "+ it('retries transient failures', async () => {\n+   await expect(fetchWithRetry()).resolves.toBeDefined();\n+ });"
        }
      ]
    });
    return "I opened a diff review. In a real host app, approval would stay separate from applying changes.";
  }

  if (normalized.includes("confirm") || normalized.includes("delete")) {
    await ui.handleToolCall("ui.confirm", {
      viewId: "confirmation",
      id: "dangerous-action",
      title: "Confirm action",
      message: "This demonstrates explicit approval before a consequential operation.",
      confirmLabel: "Approve",
      cancelLabel: "Cancel"
    });
    return "I opened a confirmation view.";
  }

  ui.clear();
  return "This request is clearer as plain text, so I did not create a UI. AgentUI is optional for each turn.";
}

export async function runMockEventTurn(event: UIEvent): Promise<string> {
  if (event.type === "submit") {
    return `Received form submission: ${JSON.stringify(event.values)}. A host application could now call its deployment tool.`;
  }
  if (event.type === "click") {
    return `Received click event "${event.id}". The button emitted intent only; no privileged action is embedded in the UI.`;
  }
  return `Received change event "${event.id}" with value ${JSON.stringify(event.value)}.`;
}

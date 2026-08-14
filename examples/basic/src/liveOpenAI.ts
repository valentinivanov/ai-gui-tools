import OpenAI from "openai";
import type { AgentUI, UIEvent } from "@agentui/core";
import { createOpenAIAdapter } from "@agentui/openai";

export interface LiveSession {
  send(input: string): Promise<string>;
  sendEvent(event: UIEvent): Promise<string>;
}

export function createLiveOpenAISession(ui: AgentUI, apiKey: string, baseURL?: string): LiveSession {
  const client = new OpenAI({
    apiKey,
    baseURL,
    dangerouslyAllowBrowser: true
  });
  const adapter = createOpenAIAdapter(ui);
  const inputItems: unknown[] = [
    {
      role: "developer",
      content: ui.instructions
    }
  ];

  async function send(input: string): Promise<string> {
    inputItems.push({ role: "user", content: input });
    return runLoop();
  }

  async function sendEvent(event: UIEvent): Promise<string> {
    inputItems.push({ role: "user", content: adapter.eventInput(event) });
    return runLoop();
  }

  async function runLoop(): Promise<string> {
    let text = "";

    for (let i = 0; i < 4; i += 1) {
      const response = await client.responses.create({
        model: import.meta.env.VITE_OPENAI_MODEL || "gpt-4.1-mini",
        input: inputItems as never,
        tools: adapter.tools() as never
      });

      inputItems.push(...(response.output as never[]));
      text += response.output_text ?? "";

      const calls = response.output.filter((item) => item.type === "function_call");
      if (calls.length === 0) {
        return text || "The model returned no text.";
      }

      for (const call of calls) {
        const handled = await adapter.handle(call);
        if (handled) {
          inputItems.push(handled);
        }
      }
    }

    return text || "Stopped after several tool-call iterations.";
  }

  return { send, sendEvent };
}

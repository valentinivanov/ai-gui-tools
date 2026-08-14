import type { UIEvent, UIEventPolicy } from "./types.js";

export function classifyUIEvent(event: UIEvent): UIEventPolicy {
  if (event.type === "submit") {
    return "model";
  }

  if (event.type === "click" && (event.id.endsWith(":confirm") || event.id.endsWith(":cancel"))) {
    return "model";
  }

  return "local";
}

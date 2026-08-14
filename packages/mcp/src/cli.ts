#!/usr/bin/env node
import { consoleLogger, startAgentUIHttpServer, startAgentUIStdioServer } from "./server.js";

const args = new Set(process.argv.slice(2));
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.slice("--port=".length)) : 3000;
const logger = consoleLogger();

if (args.has("--stdio")) {
  await startAgentUIStdioServer({ logger });
} else {
  const { url } = await startAgentUIHttpServer({ port, logger });
  console.error(`[agentui:mcp] listening on ${url}`);
}

import http from "node:http";
import { createAgentUI, type AgentUI } from "@agentui/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { AgentUIMcpLogger, RegisterAgentUIToolsOptions } from "./register.js";
import { registerAgentUITools } from "./register.js";

export interface CreateAgentUIMcpServerOptions extends Omit<RegisterAgentUIToolsOptions, "ui"> {
  ui?: AgentUI;
  name?: string;
  version?: string;
}

export interface StartHttpServerOptions extends CreateAgentUIMcpServerOptions {
  port?: number;
  path?: string;
  host?: string;
}

export function createAgentUIMcpServer(options: CreateAgentUIMcpServerOptions = {}): McpServer {
  const ui = options.ui ?? createAgentUI(options.capabilities ? { capabilities: options.capabilities } : {});
  const server = new McpServer({
    name: options.name ?? "agentui-mcp",
    version: options.version ?? "0.0.0"
  });
  const result = registerAgentUITools(server, {
    ui,
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    ...(options.toolNameStyle ? { toolNameStyle: options.toolNameStyle } : {}),
    ...(options.resourceUri ? { resourceUri: options.resourceUri } : {}),
    ...(options.registerAppResource === undefined ? {} : { registerAppResource: options.registerAppResource }),
    ...(options.logger ? { logger: options.logger } : {})
  });
  options.logger?.debug("registered tools", result.mappings.map((mapping) => mapping.transportName));
  return server;
}

export async function startAgentUIStdioServer(options: CreateAgentUIMcpServerOptions = {}): Promise<McpServer> {
  const server = createAgentUIMcpServer(options);
  await server.connect(new StdioServerTransport());
  return server;
}

export async function startAgentUIHttpServer(options: StartHttpServerOptions = {}): Promise<{ server: McpServer; httpServer: http.Server; url: string }> {
  const logger = options.logger;
  const mcpServer = createAgentUIMcpServer(options);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
  transport.onerror = (error) => logger?.debug("transport error", error.message);
  await mcpServer.connect(transport as Transport);

  const path = options.path ?? "/mcp";
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const httpServer = http.createServer((req, res) => {
    if (!req.url?.startsWith(path)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    void transport.handleRequest(req, res).catch((error: unknown) => {
      logger?.debug("http transport error", error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end(error instanceof Error ? error.message : "Unknown MCP transport error");
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  return { server: mcpServer, httpServer, url: `http://${host}:${port}${path}` };
}

export function consoleLogger(): AgentUIMcpLogger {
  return {
    debug(message, data) {
      if (data === undefined) {
        console.error(`[agentui:mcp] ${message}`);
      } else {
        console.error(`[agentui:mcp] ${message}`, JSON.stringify(data));
      }
    }
  };
}

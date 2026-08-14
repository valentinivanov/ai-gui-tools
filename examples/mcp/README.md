# AgentUI MCP Example

This example runs the AgentUI MCP server.

Build first from the repository root:

```sh
npx pnpm@9.15.0 --filter @agentui/core build
npx pnpm@9.15.0 --filter @agentui/mcp build
```

Start Streamable HTTP:

```sh
cd examples/mcp
npm run start
```

Endpoint:

```text
http://localhost:3000/mcp
```

Start stdio for local MCP clients:

```sh
cd examples/mcp
npm run stdio
```

Prompts to try in an MCP-capable host:

```text
Help me configure a TypeScript backend project.
```

```text
Compare PostgreSQL, SQLite and DynamoDB for an offline-first application.
```

```text
Explain what dependency injection is.
```

The first two should give the model a reason to call AgentUI tools. The third should usually remain plain text.

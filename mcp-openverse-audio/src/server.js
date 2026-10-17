#!/usr/bin/env node
// Local stdio MCP server entry point (Claude Code: `claude mcp add openverse-audio -- node <path>/src/server.js`).
// Logs go to stderr only — stdout is the MCP channel.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { tools, callTool } from "./tools.js";

const server = new Server({ name: "openverse-audio", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await callTool(name, args ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error("openverse-audio MCP server ready (stdio)");

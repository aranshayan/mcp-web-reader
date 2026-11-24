import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface Harness {
  client: Client;
  close: () => Promise<void>;
  call: (name: string, args?: Record<string, unknown>) => Promise<{ isError: boolean; text: string }>;
  toolNames: () => Promise<string[]>;
}

/** Connects an in-memory MCP client to `server`. */
export async function connect(server: McpServer): Promise<Harness> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
    toolNames: async () => (await client.listTools()).tools.map((t) => t.name).sort(),
    call: async (name, args = {}) => {
      const res = await client.callTool({ name, arguments: args });
      const text = (res.content as Array<{ type: string; text: string }>).map((c) => c.text).join("\n");
      return { isError: Boolean(res.isError), text };
    },
  };
}

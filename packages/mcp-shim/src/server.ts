import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HubClient } from './client.js';
import { registerTools } from './tools.js';
import { VERSION } from '@agent-hub/shared';

export function createMcpServer(client: HubClient): McpServer {
  const server = new McpServer({
    name: 'agent-hub-mcp',
    version: VERSION,
  });

  registerTools(server, client);
  return server;
}

export async function runServer(client: HubClient): Promise<void> {
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
}

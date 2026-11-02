#!/usr/bin/env node
import { loadConfig } from './config.js';
import { HubClient } from './client.js';
import { runServer } from './server.js';

export { loadConfig } from './config.js';
export { HubClient, HubClientError } from './client.js';
export { createMcpServer, runServer } from './server.js';
export { registerTools, formatOutput, formatError } from './tools.js';

export const MCP_SHIM_NAME = 'agent-hub-mcp';
export function getMcpInfo(): { name: string; version: string } {
  return { name: MCP_SHIM_NAME, version: '0.1.0' };
}

async function main(): Promise<void> {
  const isSelfTest = process.argv.includes('--selftest');

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (isSelfTest) {
      console.error(`FAILED: ${(err as Error).message}`);
      process.exit(1);
    }
    console.error((err as Error).message);
    process.exit(1);
  }

  const client = new HubClient(config);

  if (isSelfTest) {
    try {
      const res = await client.request<{
        member: { id: string; name: string };
        current_agent?: { id: string; name: string; role: string } | null;
      }>('/api/v1/me');

      const agentRole = res.current_agent?.role ?? 'registered';
      console.log(`OK: Authenticated as agent "${client.agentName}" [${agentRole}] for member "${res.member.name}"`);
      process.exit(0);
    } catch (err) {
      console.error(`FAILED: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  try {
    await runServer(client);
  } catch (err) {
    console.error('Fatal MCP Server error:', err);
    process.exit(1);
  }
}

// Execute when invoked directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main();
}

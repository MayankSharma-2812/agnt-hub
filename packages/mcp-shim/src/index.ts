/**
 * agent-hub-mcp
 * Stdio MCP server exposing hub tools to Antigravity
 */

import { VERSION } from '@agent-hub/shared';

export const MCP_SHIM_NAME = 'agent-hub-mcp';

export function getMcpInfo(): { name: string; version: string } {
  return {
    name: MCP_SHIM_NAME,
    version: VERSION,
  };
}

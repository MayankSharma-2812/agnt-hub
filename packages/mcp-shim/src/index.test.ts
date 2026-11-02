import { describe, it, expect } from 'vitest';
import { getMcpInfo, MCP_SHIM_NAME } from './index.js';

describe('mcp-shim package', () => {
  it('returns valid mcp package info', () => {
    const info = getMcpInfo();
    expect(info.name).toBe(MCP_SHIM_NAME);
    expect(info.version).toBe('0.1.0');
  });
});

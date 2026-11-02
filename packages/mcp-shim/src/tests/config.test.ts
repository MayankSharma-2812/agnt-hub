import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';

describe('MCP Shim Config Loader', () => {
  it('loads valid configuration from environment', () => {
    const config = loadConfig({
      HUB_URL: 'http://localhost:3000///',
      HUB_TOKEN: 'test_token_123',
      HUB_AGENT_NAME: 'test-agent',
    });

    expect(config.hubUrl).toBe('http://localhost:3000');
    expect(config.hubToken).toBe('test_token_123');
    expect(config.hubAgentName).toBe('test-agent');
  });

  it('fails fast when required environment variables are missing', () => {
    expect(() => loadConfig({})).toThrow(/Missing required environment variables: HUB_URL, HUB_TOKEN, HUB_AGENT_NAME/);

    expect(() =>
      loadConfig({
        HUB_URL: 'http://localhost:3000',
      }),
    ).toThrow(/Missing required environment variables: HUB_TOKEN, HUB_AGENT_NAME/);
  });
});

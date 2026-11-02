export interface HubConfig {
  hubUrl: string;
  hubToken: string;
  hubAgentName: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HubConfig {
  const missing: string[] = [];

  const hubUrl = env.HUB_URL?.trim();
  const hubToken = env.HUB_TOKEN?.trim();
  const hubAgentName = env.HUB_AGENT_NAME?.trim();

  if (!hubUrl) missing.push('HUB_URL');
  if (!hubToken) missing.push('HUB_TOKEN');
  if (!hubAgentName) missing.push('HUB_AGENT_NAME');

  if (missing.length > 0) {
    throw new Error(
      `Agent Hub MCP Shim Configuration Error: Missing required environment variables: ${missing.join(', ')}.\n` +
        `Please ensure HUB_URL, HUB_TOKEN, and HUB_AGENT_NAME are exported in your environment or configured in mcp_config.json.`,
    );
  }

  // Normalize HUB_URL (strip trailing slashes)
  const normalizedUrl = hubUrl!.replace(/\/+$/, '');

  return {
    hubUrl: normalizedUrl,
    hubToken: hubToken!,
    hubAgentName: hubAgentName!,
  };
}

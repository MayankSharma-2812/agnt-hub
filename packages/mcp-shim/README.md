# agent-hub-mcp: Agent Hub MCP Shim

The `agent-hub-mcp` package is a stdio Model Context Protocol (MCP) server connecting Google Antigravity agents directly to the Agent Hub coordination server.

## Features
- Exposes 12 coordination tools (`hub_whoami`, `hub_heartbeat`, `hub_list_tasks`, `hub_get_task`, `hub_claim_task`, `hub_update_task_status`, `hub_create_task`, `hub_send_message`, `hub_read_inbox`, `hub_lock_files`, `hub_release_locks`, `hub_add_artifact`).
- Optimistic locking and conflict reporting (translating 409 conflicts into immediate next-step instructions).
- Low token overhead with concise output summaries and structured JSON payloads.
- Automated read receipts on inbox queries.

## Antigravity Configuration & Registration

Antigravity loads MCP server definitions from:
- **Global Configuration:** `~/.gemini/config/mcp_config.json`
- **Plugin Configuration:** `plugins/<plugin_name>/mcp_config.json`

*(Reference: Antigravity Customizations & MCP Server Specification: `~/.gemini/config/mcp_config.json`)*

### Setup Steps

1. Build the shim package:
   ```bash
   pnpm --filter agent-hub-mcp build
   ```

2. Add the following entry to your `~/.gemini/config/mcp_config.json`:
   ```json
   {
     "mcpServers": {
       "agent-hub": {
         "command": "node",
         "args": [
           "/path/to/agent-hub/packages/mcp-shim/dist/index.js"
         ],
         "env": {
           "HUB_URL": "http://localhost:3000",
           "HUB_TOKEN": "YOUR_BEARER_TOKEN",
           "HUB_AGENT_NAME": "backend-agent"
         }
       }
     }
   }
   ```

3. Verify connection with the self-test flag:
   ```bash
   HUB_URL="http://localhost:3000" HUB_TOKEN="YOUR_BEARER_TOKEN" HUB_AGENT_NAME="backend-agent" node packages/mcp-shim/dist/index.js --selftest
   ```
   Expected output:
   ```
   OK: Authenticated as agent "backend-agent" [backend] for member "username"
   ```

## Environment Variables
- `HUB_URL`: Base URL of the Agent Hub instance (e.g. `http://localhost:3000` or Cloudflare tunnel URL).
- `HUB_TOKEN`: 32-byte secret bearer token issued for your team member.
- `HUB_AGENT_NAME`: Unique agent identifier for this laptop session (e.g. `backend-agent`, `frontend-agent`).

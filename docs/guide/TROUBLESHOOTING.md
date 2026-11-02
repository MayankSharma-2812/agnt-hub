# Agent Hub: Troubleshooting Guide

Comprehensive guide to diagnosing and resolving common issues across Agent Hub, Antigravity IDE, MCP shim, and `hubd`.

---

## 1. Quick Diagnostic Table

| Symptom | Root Cause | Fix / Next Step |
| :--- | :--- | :--- |
| **Token Rejected (`401 Unauthorized`)** | Token was revoked, expired, mistyped, or not yet initialized in the database. | • Check `HUB_TOKEN` in `.env` or `~/.agent-hub/hubd.json`.<br>• If you are the host, inspect the admin token printed during first startup.<br>• Generate a new token via `POST /api/v1/members`. |
| **MCP Tools Missing in Antigravity** | `mcp_config.json` path is incorrect, JSON syntax error, or shim path is wrong. | • Check exact path: `~/.gemini/config/mcp_config.json` (Linux/macOS) or `%USERPROFILE%\.gemini\config\mcp_config.json` (Windows).<br>• Verify JSON validity.<br>• Test standalone: `node packages/mcp-shim/dist/index.js --selftest`.<br>• Restart Antigravity IDE. |
| **`agy: command not found`** | Antigravity CLI binary is not installed or not present in your system `PATH`. | • Verify installation: `which agy` or `where agy`.<br>• If using custom path, set `"agyPath": "/path/to/agy"` in `~/.agent-hub/hubd.json`.<br>• For test environments without `agy`, use a mock runner script (e.g. `packages/daemon/src/tests/fixtures/fake-agy.js`). |
| **Rate Limit Reached (`429 Too Many Requests`)** | Exceeded the 100 requests per minute per token limit on the Hub. | • Back off polling interval (default daemon poll is 15s).<br>• If running simulation or bulk scripts, add a short delay between calls.<br>• Rate limit resets every 60 seconds automatically. |
| **Lock Conflict (`409 LOCK_CONFLICT`)** | Another agent holds an overlapping file lock or glob pattern (e.g. `src/**` conflicts with `src/a.ts`). | • Check active locks on the Web Dashboard (`/locks`) or via `hub_list_tasks`.<br>• Inspect `expires_at` in the 409 response payload.<br>• Wait for TTL expiry (default 10 min) or message the holding agent to release. |
| **Stuck Task (Remains `in_progress` indefinitely)** | Agent crashed or laptop went to sleep without submitting or marking blocked. | • The Hub background reaper automatically resets tasks with no heartbeat for 30 minutes back to `ready`.<br>• Force manual reset via Dashboard: open task drawer and change status to `ready`. |
| **Hub Unreachable (`ECONNREFUSED` / `HUB_UNREACHABLE`)** | Hub server is stopped, port 3000 is blocked, or Cloudflare Tunnel is down. | • Check if Hub is running: `curl http://localhost:3000/health`.<br>• If remote, test tunnel URL in browser.<br>• If hosting locally, run `pnpm --filter @agent-hub/hub dev`. |
| **Port Already in Use (`EADDRINUSE: 3000`)** | Another process is already listening on port 3000. | • Find process: `lsof -i :3000` (Linux/macOS) or `netstat -ano \| findstr :3000` (Windows).<br>• Terminate process or start hub with custom port: `PORT=3001 pnpm --filter @agent-hub/hub dev`.<br>• Update `HUB_URL` in `.env` and `hubd.json`. |
| **Windows Path & Line-Ending Issues (CRLF / `\`)** | Git converting LF to CRLF or unescaped backslashes in JSON configuration files. | • Run `git config --global core.autocrlf input`.<br>• In `mcp_config.json` and `hubd.json`, escape backslashes: `"C:\\path\\to\\smt"`.<br>• Convert scripts with `dos2unix` if executed in WSL or Git Bash. |
| **Worktree Directory Permission Denied** | Insufficient permissions in `.worktrees` directory. | • Check directory permissions: `chmod 755 .worktrees`.<br>• Ensure the repo path configured in `hubd.json` matches your user account. |

---

## 2. In-Depth Diagnostic Workflows

### Testing Hub Health Directly
```bash
curl -v http://localhost:3000/health
```
*Expected Response:*
```json
{"status":"ok","uptime":123.45}
```

### Testing Bearer Token Authentication
```bash
curl -v http://localhost:3000/api/v1/me \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```
*Expected Response (200 OK):*
```json
{
  "member": {
    "id": "mem_01hq...",
    "name": "Admin",
    "role": "admin"
  }
}
```

### Running the Diagnostic Doctor
The built-in diagnostic CLI inspects Node, Git, configuration, worktrees, hub connectivity, tokens, and the MCP shim in one command:
```bash
pnpm --filter @agent-hub/daemon hubd doctor
```
If any check fails, review the specific `Suggestion:` printed beneath the failed item.

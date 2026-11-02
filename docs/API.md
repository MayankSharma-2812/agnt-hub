# API and MCP Tool Spec: Agent Hub

All REST routes live under `/api/v1`, take `Authorization: Bearer <token>`, and return JSON. Errors use `{ "error": { "code", "message" } }`. A version or lock conflict returns 409.

**REST endpoints**

| Method and path | Purpose |
| --- | --- |
| GET /health | Liveness check, no auth |
| GET /me | Current member and their agents |
| POST /projects, GET /projects | Create and list projects |
| GET /tasks | List tasks, filters: status, role, assignee, project |
| POST /tasks | Create a task (orchestrator or human) |
| GET /tasks/:id | Task with dependencies, messages, artifacts and runs |
| PATCH /tasks/:id | Edit fields; body must carry the current `version` |
| POST /tasks/:id/claim | Claim a ready task for the calling agent |
| POST /tasks/:id/status | Move along the allowed transitions |
| POST /tasks/:id/deps | Add or remove a dependency |
| POST /agents/heartbeat | Update status, current task and last seen |
| GET /agents | Roster with presence |
| POST /messages | Send a message (to an agent, or broadcast) |
| GET /messages | Inbox, filters: unread, task, kind |
| POST /messages/:id/read | Mark read |
| POST /locks, GET /locks | Acquire (409 on overlap) and list locks |
| DELETE /locks/:id | Release; admin can force |
| POST /artifacts | Attach a plan, report, screenshot or PR link to a task |
| POST /runs, PATCH /runs/:id | Daemon reports a run starting and finishing |
| GET /events?since=ID | Audit log, polling form |
| GET /events/stream | Server-Sent Events for live updates |
| POST /admin/members, POST /admin/tokens | Admin only: create members, issue and revoke tokens |

**MCP tools exposed by the shim**

| Tool | What it does | Key arguments |
| --- | --- | --- |
| `hub_whoami` | Returns the member, agent name and role | none |
| `hub_heartbeat` | Reports status and current task | status, task_id |
| `hub_list_tasks` | Lists tasks the agent could pick up or is working on | status, role |
| `hub_get_task` | Full task with deps, messages and artifacts | task_id |
| `hub_claim_task` | Claims a ready task | task_id, version |
| `hub_update_task_status` | Moves a task to the next allowed state | task_id, status, note |
| `hub_create_task` | Creates a task (orchestrator role only) | title, description, acceptance_criteria, role_required, depends_on |
| `hub_send_message` | Sends a message | to (agent or all), kind, body, task_id |
| `hub_read_inbox` | Returns unread messages and marks them read | limit |
| `hub_lock_files` | Locks path globs; returns conflicts | paths, task_id, ttl_minutes |
| `hub_release_locks` | Releases the agent's locks | task_id |
| `hub_add_artifact` | Attaches a result to a task | task_id, kind, title, uri, summary |

**Tool behavior rules**

- Every tool returns short, plain text plus a structured JSON block, so agents spend few tokens reading results.
- Errors say what to do next, for example: "Locked by backend-agent for task T-12 until 14:30. Pick another task or message the owner."
- The shim reads `HUB_URL`, `HUB_TOKEN` and `HUB_AGENT_NAME` from its environment, so each laptop only sets three values.

**Antigravity MCP config (per laptop)**

Antigravity reads `mcp_config.json`. Check its docs for the exact location, then add an entry like this:

```json
{
  "mcpServers": {
    "agent-hub": {
      "command": "npx",
      "args": ["-y", "agent-hub-mcp"],
      "env": {
        "HUB_URL": "https://YOUR-HUB-URL",
        "HUB_TOKEN": "PASTE-YOUR-TOKEN",
        "HUB_AGENT_NAME": "backend-agent"
      }
    }
  }
}
```

If the package is not published, point `command` to `node` and `args` to the built shim in your clone instead.

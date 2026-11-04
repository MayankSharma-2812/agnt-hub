# Agent Hub: Daily Cheatsheet

A single-page quick reference for daily commands and the core 3-step agent cycle.

---

## 1. The Daily 3-Step Loop

```text
[Step 1: Pick Task]  ───>  [Step 2: Run Agent]  ───>  [Step 3: Review PR]
  • Board: "ready"           • Daemon claims & locks    • Inspect worktree branch
  • Match role               • agy executes headless   • Verify acceptance tests
  • Transitions in_progress  • Pushes worktree branch  • Squash merge & mark done
```

---

## 2. Most Common Commands

### Starting Up
| Task | Command |
| :--- | :--- |
| **Run Everything (Fresh Laptop)** | `./scripts/bootstrap.sh` *(Windows: `.\scripts\bootstrap.ps1`)* |
| **Start Hub & Web Dashboard** | `pnpm --filter @agent-hub/hub dev` |
| **Start Headless Daemon** | `pnpm --filter @agent-hub/daemon hubd start` |
| **Check Daemon Status** | `pnpm --filter @agent-hub/daemon hubd status` |
| **Stop Daemon** | `pnpm --filter @agent-hub/daemon hubd stop` |

---

### Diagnostics & Testing
| Task | Command |
| :--- | :--- |
| **Full Environment Doctor** | `pnpm --filter @agent-hub/daemon hubd doctor` |
| **MCP Shim Standalone Self-Test** | `HUB_URL=... HUB_TOKEN=... HUB_AGENT_NAME=... node packages/mcp-shim/dist/index.js --selftest` |
| **Run All Unit Tests** | `pnpm test` |
| **Typecheck Workspace** | `pnpm typecheck` |
| **Lint Workspace** | `pnpm lint` |
| **Build Workspace Packages** | `pnpm build` |

---

### Admin & Operations
| Task | Command |
| :--- | :--- |
| **Create SQLite Backup** | `./scripts/backup.sh apps/hub/agent-hub.db ./backups` |
| **Restore SQLite Backup** | `./scripts/restore.sh ./backups/latest.db apps/hub/agent-hub.db` |
| **Expose Hub (Cloudflare Tunnel)** | `cloudflared tunnel --url http://localhost:3000` |
| **Create Member & Token** | `curl -X POST http://localhost:3000/api/v1/members -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"name":"Alice","email":"alice@example.com","role":"developer"}'` |
| **Check Hub Health** | `curl http://localhost:3000/health` |

---

## 3. Key Paths & Configurations

| Item | Path |
| :--- | :--- |
| **Workspace Root** | `/path/to/agent-hub` |
| **Hub Database (SQLite)** | `apps/hub/agent-hub.db` |
| **Daemon Config** | `~/.agent-hub/hubd.json` |
| **Daemon Logs** | `~/.agent-hub/logs/` |
| **Worktree Sandbox** | `.worktrees/` |
| **Antigravity MCP Config (Linux/macOS)** | `~/.gemini/config/mcp_config.json` |
| **Antigravity MCP Config (Windows)** | `%USERPROFILE%\.gemini\config\mcp_config.json` |

---

## 4. MCP Tools Quick Reference
Antigravity agents can invoke these tools in conversation:
- `hub_whoami`: Check agent identity and current role.
- `hub_list_tasks`: Find ready tasks for your role.
- `hub_claim_task`: Atomically claim a ready task with optimistic locking.
- `hub_lock_files`: Acquire locks on target file globs with TTL.
- `hub_release_locks`: Release locks when task completes.
- `hub_update_task_status`: Transition task state (`in_progress`, `blocked`, `in_review`, `done`).
- `hub_send_message` / `hub_read_inbox`: Coordinate with orchestrator and peers.

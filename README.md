# 🤖 Agent Hub

> **Collaborative multi-agent coordination server and Kanban dashboard for autonomous AI coding agents (Antigravity, Claude, Cursor) with zero infrastructure cost.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green?logo=node.js)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-black?logo=fastify)](https://www.fastify.io/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC?logo=tailwind_css)](https://tailwindcss.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-63%2F63%20Passed-brightgreen)](https://github.com/MayankSharma-2812/agnt-hub)

---

## ⚡ Why Agent Hub?

Most multi-agent frameworks (CrewAI, AutoGen, LangGraph) are code libraries requiring complex orchestration pipelines, external cloud message queues, or heavy SaaS subscriptions.

**Agent Hub takes a fundamentally different approach:**
It treats autonomous coding agents like human developers on an agile team.
Agents query a central board, claim tickets, lock file paths so they don't overwrite each other's work, post messages to an inbox, and work isolated in dedicated git worktrees.

- **Zero Cloud Cost**: Powered by local SQLite with Write-Ahead Logging (WAL) and Fastify.
- **MCP-Native**: Comes with a standard Model Context Protocol (MCP) server with 12 tools (`hub_claim_task`, `hub_lock_files`, `hub_send_message`, etc.) ready for Antigravity or any MCP-compatible client.
- **No File Overwrites**: File locking with glob matching (Picomatch) prevents agents from colliding on the same files.
- **Git Worktree Isolation**: The `hubd` daemon isolates each task in its own git worktree so concurrent agents never create git merge chaos.
- **Real-Time Kanban UI**: Sleek React/Tailwind board with Server-Sent Events (SSE) for live task updates, agent heartbeats, and audit activity.

---

## 🏗️ Architecture

```
                          ┌───────────────────────────┐
                          │   React Kanban Board UI   │
                          │     (Vite + Tailwind)     │
                          └─────────────▲─────────────┘
                                        │  SSE / REST
                                        ▼
                          ┌───────────────────────────┐
                          │     Fastify Hub Server    │
                          │   (SQLite WAL + Reaper)   │
                          └───────▲───────────▲───────┘
                                  │           │
                    REST API (Bearer)       REST API (Bearer)
                                  │           │
                     ┌────────────┴──┐     ┌──┴────────────┐
                     │ agent-hub-mcp │     │  hubd Daemon  │
                     │  (stdio MCP)  │     │  (Headless)   │
                     └───────▲───────┘     └───▲───────────┘
                             │                 │
                      Antigravity IDE     Git Worktrees
                     (Interactive Dev)    (Autonomous Dev)
```

---

## 📦 Monorepo Structure

| Package / App | Purpose | Tech Stack |
| :--- | :--- | :--- |
| [`apps/hub`](apps/hub) | REST API, SQLite database, SSE event bus, and task reaper | Fastify, SQLite (`better-sqlite3`), Zod |
| [`apps/web`](apps/web) | Real-time Kanban board, lock manager, and agent telemetry | React 18, Vite, Tailwind CSS, Lucide |
| [`packages/mcp-shim`](packages/mcp-shim) | MCP server exposing 12 tools to AI IDEs | `@modelcontextprotocol/sdk`, Zod |
| [`packages/daemon`](packages/daemon) | Headless runner daemon with git worktree isolation | TypeScript CLI, Commander |
| [`packages/shared`](packages/shared) | Shared domain schemas, invariants, and ULID generators | TypeScript, Zod |
| [`scripts/`](scripts/) | Bootstrap, doctor diagnostics, hot backup/restore, and simulation | Bash, PowerShell, TypeScript |

---

## 🚀 Quick Start (60 Seconds)

### 1. Clone & Bootstrap
```bash
git clone https://github.com/MayankSharma-2812/agnt-hub.git
cd agnt-hub
./scripts/bootstrap.sh
```

### 2. Start the Hub
```bash
pnpm --filter @agent-hub/hub dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. The initial admin token is logged directly in your terminal.

---

## 🔌 Connecting Your AI Agents (MCP Setup)

Add Agent Hub to your Antigravity (or Claude Desktop) configuration file:

**Linux / macOS:** `~/.gemini/config/mcp_config.json`  
**Windows:** `%USERPROFILE%\.gemini\config\mcp_config.json`

```json
{
  "mcpServers": {
    "agent-hub": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/agnt-hub/packages/mcp-shim/dist/index.js"
      ],
      "env": {
        "HUB_URL": "http://localhost:3000",
        "HUB_TOKEN": "<YOUR_TOKEN_HERE>",
        "HUB_AGENT_NAME": "backend-agent"
      }
    }
  }
}
```

### Available MCP Tools

Agents can immediately interact with the hub through standard tool calls:
- `hub_whoami` — Check connected identity and assigned role
- `hub_heartbeat` — Send health ping (`idle`, `working`, `stuck`)
- `hub_list_tasks` — Query available tasks filtered by status and role
- `hub_claim_task` — Atomically claim a task with optimistic locking
- `hub_update_task_status` — Advance lifecycle (`claimed` → `in_progress` → `in_review` → `done`)
- `hub_lock_files` — Acquire exclusive file locks with glob patterns
- `hub_release_locks` — Release file locks
- `hub_send_message` — Post messages to team members or other agents
- `hub_read_inbox` — Retrieve unread agent communications
- `hub_add_artifact` — Attach deliverables (PR links, reports) to a task

---

## 🧪 Testing & Reliability

The codebase features 100% automated test coverage across all packages, verified by chaos tests and multi-agent load simulations:

```bash
# Run unit and integration test suite (25 files, 63 tests)
pnpm test

# Run multi-agent concurrency simulation (5 simulated concurrent agents)
pnpm --filter @agent-hub/daemon test:sim
```

---

## 📖 Documentation

- [Detailed Setup & OS Matrix](docs/guide/SETUP.md)
- [Team USAGE & Collaboration Guide](docs/guide/USAGE.md)
- [Self-Hosting & Cloudflare Tunnel](docs/guide/HOST.md)
- [Troubleshooting & FAQs](docs/guide/TROUBLESHOOTING.md)
- [Single-Page Cheatsheet](docs/guide/CHEATSHEET.md)

---

## 🤝 Contributing

Contributions are warmly welcomed! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

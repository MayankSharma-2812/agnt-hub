# Agent Hub

Agent Hub is a lightweight coordination server that lets up to five teammates' Antigravity AI agents share a task board, send messages, claim tasks, lock file paths to avoid collisions, and open GitHub PRs at zero infrastructure cost.

## Structure
- `apps/hub`: Fastify coordination server + SQLite database
- `apps/web`: React/Vite/Tailwind dashboard
- `packages/shared`: Shared domain types, schemas, and constants
- `packages/mcp-shim`: `agent-hub-mcp` stdio MCP server for Antigravity IDE integration
- `packages/daemon`: `hubd` daemon runner for headless task execution
- `scripts/`: Operational scripts (setup, doctor, backup)
- `docs/`: System documentation (PRD, TRD, SCHEMA, API, UIUX, PLAN, TASKS, AGY_NOTES)

## Quick Start
```bash
pnpm install
pnpm run build
pnpm run test
```

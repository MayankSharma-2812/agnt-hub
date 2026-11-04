# Contributing to Agent Hub

Thank you for your interest in contributing to Agent Hub! We welcome issues, PRs, and suggestions to make multi-agent AI coordination simple, robust, and accessible.

## Development Setup

1. **Prerequisites**:
   - Node.js >= 20.0.0
   - pnpm (`npm install -g pnpm`)
   - Git

2. **Clone and Install**:
   ```bash
   git clone https://github.com/MayankSharma-2812/agnt-hub.git
   cd agnt-hub
   ./scripts/bootstrap.sh
   ```

3. **Run Dev Servers**:
   ```bash
   # Start Fastify Hub backend (serves API & SSE)
   pnpm --filter @agent-hub/hub dev

   # In another terminal, start React Vite frontend
   pnpm --filter @agent-hub/web dev
   ```

## Project Structure

- `apps/hub`: Fastify REST API, SQLite database with WAL mode, SSE event bus.
- `apps/web`: React 18, Vite, Tailwind CSS, Lucide icons (Kanban board & dashboard).
- `packages/shared`: Shared TypeScript domain types, schemas, and constants.
- `packages/mcp-shim`: Model Context Protocol (MCP) stdio server exposing tools to AI agents.
- `packages/daemon`: `hubd` daemon runner for headless task execution and git worktree isolation.
- `scripts/`: Diagnostic doctor, multi-agent concurrency simulations, online hot backup/restore.

## Submitting Pull Requests

1. **Branch Naming**: `feat/your-feature`, `fix/your-fix`, or `docs/your-doc`.
2. **Quality Checks**:
   Always verify the workspace passes all checks prior to submitting:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
3. **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat(hub): add support for...`, `fix(web): resolve event reconnect issue`).
4. **Testing**: Add unit or integration tests for new business logic in the corresponding package's `tests/` directory.

## Code of Conduct

Be welcoming, respectful, and collaborative. We are building the future of autonomous agent teamwork together!

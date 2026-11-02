# TRD: Agent Hub

The hub is one Node.js process with a SQLite file; the MCP shim, the daemon and the dashboard are thin clients of its REST API.

```text
Laptop (each member)                           Host (one machine or free tier)
+--------------------------------+             +-----------------------------------+
| Antigravity IDE or agy CLI     |             | Agent Hub server (Node + Fastify) |
|   | MCP over stdio             |    HTTPS    |   REST /api/v1 + SSE /events      |
|   v                            | ----------> |   SQLite (WAL) + audit events     |
| agent-hub-mcp (shim)           |             |   Serves dashboard static files   |
|                                |             +-----------------------------------+
| hubd daemon (optional)         |  poll / SSE               ^
|   runs agy headless per task   | --------------------------+
|                                |
| git worktree -> branch -> PR   | ---> GitHub (PRs, Actions CI)
+--------------------------------+
```

**Stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript on Node 20+ | One language everywhere; strong agent support |
| Hub | Fastify, zod, better-sqlite3 | Small, fast, no external database |
| Realtime | Server-Sent Events | Simpler than WebSockets; one-way updates are enough |
| MCP shim | Official MCP TypeScript SDK, stdio transport | Works without depending on remote-MCP support in the IDE |
| Dashboard | React, Vite, Tailwind, TanStack Query | Fast to build; static output served by the hub |
| Daemon | Node CLI `hubd` using child_process | Starts `agy` per task and streams output back |
| Tests | Vitest, Playwright smoke test | Free; runs in CI |
| Repo | pnpm workspaces monorepo, GitHub Actions | Free for normal use |

**Task lifecycle**

1. The orchestrator or a human creates tasks; those without open dependencies become `ready`.
2. A worker agent calls `hub_claim_task`. The hub sets `claimed` only if the version matches (optimistic lock); otherwise it returns 409.
3. The agent locks the paths it will touch, creates a branch, and sets `in_progress`.
4. It sends questions or blockers through the hub; humans see them on the board.
5. It opens a PR, attaches the link as an artifact, releases its locks, and sets `in_review`.
6. A human (or a reviewer agent plus a human) merges, the task becomes `done`, and dependent tasks become `ready`.

**Free hosting options** (verify current terms before relying on any)

- A: Run the hub on one always-on teammate machine and expose it with a free Cloudflare Tunnel.
- B: Put the hub and all laptops on a free VPN overlay your team already trusts.
- C: A free-tier host with a persistent disk, only if one still offers it. Sleeping hosts slow agents down.

Start with A. Back up nightly with `sqlite3 .backup` into a folder synced to a private repo.

**Security**

- Each member gets a bearer token. Only a hash is stored, and tokens can be revoked.
- HTTPS only, through the tunnel. CORS is limited to the dashboard origin.
- The hub never stores Google credentials, model keys or session tokens.
- The daemon never passes auto-approve flags (such as `--yolo`) unless the member opts in per project. Use Antigravity's sandbox and strict modes where available.
- The daemon runs agents only inside a git worktree it created.
- Every write is appended to an events table, which is the audit log and the source for live updates.

**Reliability rules**

- Locks expire after 2 hours unless renewed; the admin can force-release them.
- A task claimed with no heartbeat for 30 minutes returns to `ready`.
- Daemon limits: a daily run cap per member, a per-run timeout (default 45 minutes), and exponential backoff on rate-limit errors.
- If the hub is unreachable, the daemon queues status updates and retries.

**Non-functional targets**

- API p95 under 150 ms on a laptop host with 5 clients.
- Cold start under 3 seconds, and one command to run the hub.
- No paid dependency; all packages open source.

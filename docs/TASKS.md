# Agent Hub: Master Task Breakdown (M1 to M5)

All tasks are scoped to at most half a day (2–4 hours) of work.
Tasks follow dependencies and role assignments defined in `AGENTS.md` and `docs/PLAN.md`.

---

## Milestone 1: Hub Core (`apps/hub` & `packages/shared`)

### T-M1-01: Shared Zod Schemas and Domain Types
- **Role:** backend
- **Depends On:** none
- **Acceptance Criteria:**
  - Export Zod schemas and TypeScript types in `packages/shared` for: `Member`, `Agent`, `Project`, `Task`, `Message`, `FileLock`, `Artifact`, `Run`, and `Event`.
  - Validate task status transitions enum and agent roles enum matching `docs/SCHEMA.md`.
  - Export error payload schema `{ error: { code: string, message: string } }`.
  - Unit tests verify schema parsing and validation rejects invalid inputs.

### T-M1-02: SQLite Schema Migrations with WAL Mode
- **Role:** backend
- **Depends On:** T-M1-01
- **Acceptance Criteria:**
  - Automated migration runner runs on `apps/hub` startup using `better-sqlite3`.
  - `PRAGMA journal_mode = WAL;` and `PRAGMA foreign_keys = ON;` executed on every connection.
  - All 11 tables and indices from `docs/SCHEMA.md` created idempotently.
  - Test verifies schema tables exist and foreign key enforcement is active.

### T-M1-03: Bearer Token Auth & Admin Bootstrap
- **Role:** backend
- **Depends On:** T-M1-02
- **Acceptance Criteria:**
  - Fastify auth plugin authenticates requests with `Authorization: Bearer <token>`.
  - Token hashes (SHA-256) stored in `api_tokens`; raw token never stored in DB or logged.
  - On first startup with empty database, generates an admin member and prints 32-byte secret token once to stdout.
  - Tests verify valid token succeeds, revoked token returns 401, missing token returns 401.

### T-M1-04: Task CRUD and Optimistic Concurrency Control
- **Role:** backend
- **Depends On:** T-M1-03
- **Acceptance Criteria:**
  - `POST /api/v1/tasks` creates a task in `backlog` (or `ready` if dependencies empty).
  - `GET /api/v1/tasks` returns task list with filters (`status`, `role_required`, `assignee_agent_id`, `project_id`).
  - `GET /api/v1/tasks/:id` returns task details including dependencies, messages, artifacts.
  - `PATCH /api/v1/tasks/:id` validates incoming `version`; returns 409 conflict if version does not match current DB version.
  - `POST /api/v1/tasks/:id/claim` atomically claims task for calling agent, increments version, or returns 409 if version mismatch or already claimed.
  - Tests assert concurrency claim race between 2 simultaneous callers allows only 1 winner.

### T-M1-05: Task Lifecycle State Machine & Dependency Checking
- **Role:** backend
- **Depends On:** T-M1-04
- **Acceptance Criteria:**
  - `POST /api/v1/tasks/:id/status` validates transitions against allowed table in `docs/SCHEMA.md`.
  - Disallowed transitions reject with 409 and return `{ error: { code: "INVALID_TRANSITION", message: "...", allowed: [...] } }`.
  - When all dependent tasks in `task_deps` reach `done`, dependent tasks transition from `backlog` to `ready`.
  - Marking `in_review` asserts active locks are released and PR artifact exists.
  - Tests cover every valid and invalid status transition.

### T-M1-06: File Lock Conflict Detection and Expiry Engine
- **Role:** backend
- **Depends On:** T-M1-03
- **Acceptance Criteria:**
  - `POST /api/v1/locks` accepts `path_glob`, `task_id`, `ttl_minutes` (default 120m).
  - Detects overlapping active glob locks across different agents (e.g. `apps/hub/**` overlaps `apps/hub/src/index.ts`).
  - Overlap returns 409 with details of the holding agent and expiration timestamp.
  - Enforces cap of at most 10 active locks per agent.
  - `DELETE /api/v1/locks/:id` releases lock (admin can force-release).
  - Tests verify glob overlap matching, self-renewal, and conflict rejection.

### T-M1-07: Messaging System & Inbox
- **Role:** backend
- **Depends On:** T-M1-03
- **Acceptance Criteria:**
  - `POST /api/v1/messages` creates message with kind (`info`, `question`, `answer`, `handoff`, `blocker`, `review_request`).
  - Broadcast messages supported when `to_agent_id` is null.
  - `GET /api/v1/messages` supports filtering by `unread`, `task_id`, `kind`.
  - `POST /api/v1/messages/:id/read` marks message as read for the calling agent.
  - Tests verify messaging flow, thread replies (`reply_to_id`), and read markers.

### T-M1-08: Artifacts & Run Tracking
- **Role:** backend
- **Depends On:** T-M1-03
- **Acceptance Criteria:**
  - `POST /api/v1/artifacts` records artifacts linked to `task_id` (`plan`, `diff`, `test_report`, `screenshot`, `doc`, `pr`, `link`).
  - `POST /api/v1/runs` and `PATCH /api/v1/runs/:id` log agent execution runs with status (`running`, `succeeded`, `failed`, `timeout`, `rate_limited`, `cancelled`).
  - Tests verify artifact creation and run update lifecycle.

### T-M1-09: Audit Events Log and SSE Stream
- **Role:** backend
- **Depends On:** T-M1-04, T-M1-06, T-M1-07
- **Acceptance Criteria:**
  - Every mutating endpoint writes an `events` table row inside the same database transaction.
  - `GET /api/v1/events?since=ID` allows polling events log.
  - `GET /api/v1/events/stream` provides Server-Sent Events (SSE) with `Last-Event-ID` header resumption support.
  - Tests verify event generation on claim/release/lock and SSE connection reconnects with resumed events.

### T-M1-10: Background Reaper Services
- **Role:** backend
- **Depends On:** T-M1-05, T-M1-06
- **Acceptance Criteria:**
  - Periodic timer (runs every 60s) checks and expires locks where `expires_at < datetime('now')`.
  - Periodic timer detects claimed/in_progress tasks with no agent heartbeat for > 30 minutes and reverts them to `ready`.
  - Unit tests verify timer triggers expiration and task revert logic.

### T-M1-11: Rate Limiter Middleware
- **Role:** backend
- **Depends On:** T-M1-03
- **Acceptance Criteria:**
  - Rate limits requests to 100 requests per minute per API token.
  - Exceeding limit returns HTTP 429 Too Many Requests with `Retry-After` header.
  - Tests verify 101st request within 60s returns 429.

### T-M1-12: End-to-End Task Lifecycle Demo Script
- **Role:** backend
- **Depends On:** T-M1-01 through T-M1-11
- **Acceptance Criteria:**
  - Shell script `scripts/demo-lifecycle.sh` executes full curl workflow: create project -> create task -> claim task -> lock file -> post message -> attach PR -> release lock -> mark in_review.
  - Script returns exit code 0 when all steps succeed against running hub.

---

## Milestone 2: MCP Shim (`packages/mcp-shim`)

### T-M2-01: MCP Server Scaffold & Env Validation
- **Role:** integrations
- **Depends On:** T-M1-01
- **Acceptance Criteria:**
  - Setup stdio MCP server using `@modelcontextprotocol/sdk`.
  - Validates `HUB_URL`, `HUB_TOKEN`, `HUB_AGENT_NAME` on boot; fails fast with clear error if missing.
  - CLI flag `--selftest` performs healthcheck against hub and exits 0 on success.
  - Tests verify configuration loader error messages on missing env vars.

### T-M2-02: Identity and Presence Tools (`hub_whoami`, `hub_heartbeat`)
- **Role:** integrations
- **Depends On:** T-M2-01, T-M1-03
- **Acceptance Criteria:**
  - `hub_whoami` returns caller member, agent name, and assigned role.
  - `hub_heartbeat` sends presence update with status (`idle`, `working`, `blocked`) and active task ID.
  - Tool outputs plain text summary + structured JSON block.
  - Tests mock hub API and verify tool return structure.

### T-M2-03: Task Management MCP Tools
- **Role:** integrations
- **Depends On:** T-M2-01, T-M1-04, T-M1-05
- **Acceptance Criteria:**
  - Implement `hub_list_tasks`, `hub_get_task`, `hub_claim_task`, `hub_update_task_status`, `hub_create_task`.
  - `hub_create_task` verifies caller has `orchestrator` role before submission.
  - `hub_claim_task` maps 409 conflict responses to clear next actions for the agent.
  - Tests verify input validation and response payloads for all 5 tools.

### T-M2-04: Messaging & Inbox MCP Tools
- **Role:** integrations
- **Depends On:** T-M2-01, T-M1-07
- **Acceptance Criteria:**
  - Implement `hub_send_message` (with target recipient or broadcast) and `hub_read_inbox`.
  - `hub_read_inbox` automatically marks returned messages as read.
  - Output formatted for low token consumption.
  - Tests verify messaging flow through mock server.

### T-M2-05: Lock & Artifact MCP Tools
- **Role:** integrations
- **Depends On:** T-M2-01, T-M1-06, T-M1-08
- **Acceptance Criteria:**
  - Implement `hub_lock_files`, `hub_release_locks`, and `hub_add_artifact`.
  - `hub_lock_files` returns clear error message if locked by another agent (who holds it and until when).
  - Tests verify lock conflict formatting and artifact recording.

### T-M2-06: Antigravity MCP Configuration & Integration Test
- **Role:** integrations
- **Depends On:** T-M2-02 through T-M2-05
- **Acceptance Criteria:**
  - Provide `examples/mcp_config.json` template for Antigravity IDE registration.
  - Integration test runs MCP client against running M1 Hub server and verifies end-to-end tool execution.

---

## Milestone 3: Dashboard (`apps/web`)

### T-M3-01: Web App Scaffold and Tailwind Theme Tokens
- **Role:** frontend
- **Depends On:** none
- **Acceptance Criteria:**
  - Vite + React + TypeScript + Tailwind setup in `apps/web`.
  - CSS variables configured for dark (default) and light themes matching design tokens in `docs/UIUX.md`.
  - Role badge colors configured: orchestrator (violet), backend (blue), frontend (teal), QA (amber), devops (gray).
  - Inter and JetBrains Mono fonts configured.

### T-M3-02: Auth State, API Client, and Mock Service Worker (MSW)
- **Role:** frontend
- **Depends On:** T-M1-01, T-M3-01
- **Acceptance Criteria:**
  - Token storage in `localStorage` with Sign-in screen (`HUB_URL` + `HUB_TOKEN`).
  - TanStack Query client configured with auto-retry and bearer token headers.
  - MSW mock handlers created covering all REST endpoints for offline frontend development.
  - Test verifies sign-in form validation and token persistence.

### T-M3-03: Real-Time SSE Event Consumer
- **Role:** frontend
- **Depends On:** T-M3-02
- **Acceptance Criteria:**
  - Hook `useHubEvents` connects to `GET /api/v1/events/stream` with reconnect backoff and `Last-Event-ID`.
  - Dispatches TanStack Query cache invalidation for updated entities.
  - Triggers CSS highlight pulse on affected task cards.
  - Dispatches offline warning banner when disconnected.

### T-M3-04: Kanban Task Board View
- **Role:** frontend
- **Depends On:** T-M3-02, T-M3-03
- **Acceptance Criteria:**
  - Columns: Ready, Claimed, In Progress, Blocked, In Review, Done.
  - Cards show title, role chip, assignee avatar, lock indicator, and dependency count.
  - Drag-and-drop moves cards between allowed states, with keyboard/menu alternative.
  - Blocked tasks prominently highlighted with danger color token.
  - Filter by role, assignee agent, and priority.

### T-M3-05: Task Detail Drawer Component
- **Role:** frontend
- **Depends On:** T-M3-04
- **Acceptance Criteria:**
  - Slide-out drawer with tabs: Spec, Activity, Messages, Artifacts, Runs.
  - Displays owner, git branch, and PR link.
  - Actions: Edit spec, Approve (move to done), Request changes, Cancel.
  - Threaded message view inside drawer with reply box.

### T-M3-06: Agents Roster & Presence View
- **Role:** frontend
- **Depends On:** T-M3-02
- **Acceptance Criteria:**
  - Grid of agent cards: role, member owner, status dot (offline/idle/working/blocked), current task link.
  - Daily run usage progress bar against `daily_run_cap`.
  - Admin control to pause agent or adjust daily cap.

### T-M3-07: Inbox & File Locks View
- **Role:** frontend
- **Depends On:** T-M3-02
- **Acceptance Criteria:**
  - Inbox screen with threaded view filtered by kind (`blocker`, `question`, `handoff`).
  - Active locks table showing path glob, holder agent, associated task, and countdown to expiration.
  - Release lock button (admin can force-release).

### T-M3-08: Setup Page, Shortcuts & Mobile Responsiveness
- **Role:** frontend
- **Depends On:** T-M3-04 through T-M3-07
- **Acceptance Criteria:**
  - Setup screen with token generator and copyable `mcp_config.json` snippet.
  - Global keyboard shortcuts implemented: `g b` (board), `g a` (agents), `g i` (inbox), `/` (search), `n` (new task).
  - Responsive at 390px viewport width: board collapses to single column with status selector; drawer becomes full screen.
  - WCAG AA contrast verified; visible focus rings on interactive elements.

### T-M3-09: Playwright Smoke Test Suite
- **Role:** frontend
- **Depends On:** T-M3-08
- **Acceptance Criteria:**
  - Automated smoke test passes: sign in -> view board -> open task drawer -> create task -> receive live event update.
  - Runs headless in CI and takes screenshot artifacts.

---

## Milestone 4: Daemon (`packages/daemon` - `hubd`)

### T-M4-01: Daemon Scaffold and Configuration Loader
- **Role:** integrations
- **Depends On:** T-M1-01
- **Acceptance Criteria:**
  - CLI binary `hubd` supporting commands: `init`, `start`, `stop`, `status`, `doctor`.
  - Config file at `~/.agent-hub/hubd.json` validating: `hubUrl`, `token`, `agentName`, `role`, `repoPath`, `maxRunsPerDay`, `runTimeoutMinutes` (default 45), `agyPath`, `autoApprove` (default false).
  - `hubd init` prompts or writes default config file with strict file permissions (0600).
  - Tests verify config validation and error handling on malformed config.

### T-M4-02: Git Worktree Isolation Manager
- **Role:** integrations
- **Depends On:** T-M4-01
- **Acceptance Criteria:**
  - Helper creates dedicated git worktree for each task on branch `agent/<role>/<task-id>-<slug>`.
  - Verifies worktree is cleanly removed and unmounted upon task completion or failure.
  - Refuses to execute agent outside of created worktree directory.
  - Tests verify worktree creation, branch checkouts, and cleanup.

### T-M4-03: Task Watcher Loop & Prompt Assembler
- **Role:** integrations
- **Depends On:** T-M4-01, T-M1-04
- **Acceptance Criteria:**
  - Polling loop (every 15s) / SSE listener fetches ready tasks matching agent's role or assigned to agent.
  - Claims task via `POST /tasks/:id/claim`.
  - Assembles prompt from task title, description, acceptance criteria, linked messages, and relevant doc paths.
  - Tests verify prompt assembly formatting.

### T-M4-04: Headless Execution Engine
- **Role:** integrations
- **Depends On:** T-M4-02, T-M4-03
- **Acceptance Criteria:**
  - Spawns `agy` in headless mode within task worktree using `child_process`.
  - Streams stdout/stderr into run log file in `~/.agent-hub/logs/`.
  - Reports run start via `POST /api/v1/runs` and completion via `PATCH /api/v1/runs/:id`.
  - Strict security guard: never passes auto-approve flags unless `autoApprove: true` in config.
  - Tests run with mock execution script verifying lifecycle tracking.

### T-M4-05: Rate Limiting, Timeout Guard, and Run Caps
- **Role:** integrations
- **Depends On:** T-M4-04
- **Acceptance Criteria:**
  - Enforces per-member `daily_run_cap`; halts picking new tasks when cap is reached.
  - Kills runaway child process if execution exceeds `runTimeoutMinutes` (default 45 min) and marks run `timeout`.
  - On 429 or rate-limit output, marks run `rate_limited`, applies exponential backoff up to 30 minutes, and notifies orchestrator via `POST /messages`.
  - Tests verify timeout kill and backoff calculations.

### T-M4-06: Git Push & Task Completion Reporter
- **Role:** integrations
- **Depends On:** T-M4-04
- **Acceptance Criteria:**
  - Checks if agent made commits on the branch. If yes, pushes branch to origin.
  - Never merges to `main` branch.
  - If agent exits cleanly without setting status, sets task to `blocked` with a descriptive diagnostic message.
  - Tests verify branch push trigger and exit code handling.

### T-M4-07: Diagnostic Doctor Command (`hubd doctor`)
- **Role:** integrations
- **Depends On:** T-M4-01 through T-M4-06
- **Acceptance Criteria:**
  - `hubd doctor` checks: Node.js >= 20, git binary present, `agy` CLI binary found, Hub reachable, token valid, MCP shim test OK, worktree directory writable.
  - Prints clean Pass/Fail checklist with fix suggestions.

---

## Milestone 5: Hardening & DevOps

### T-M5-01: Multi-Platform CI Workflow Matrix
- **Role:** qa
- **Depends On:** T-M1-01, T-M3-01, T-M4-01
- **Acceptance Criteria:**
  - GitHub Actions matrix tests across Ubuntu, macOS, and Windows.
  - Runs lint, type-check, unit tests, and Playwright smoke job on Ubuntu.
  - Secret scanning step verifies no tokens or `.env` files committed.
  - CI passes on pull requests.

### T-M5-02: Multi-Agent Concurrency Simulation Script
- **Role:** qa
- **Depends On:** T-M1-12, T-M2-06
- **Acceptance Criteria:**
  - `scripts/sim-agents.ts` launches hub and 5 simulated concurrent agents (orchestrator, backend, frontend, qa, devops).
  - Short mode (runs in CI under 5 minutes) and soak mode (configurable up to 24h).
  - Asserts zero stuck tasks, zero unhandled lock collisions, and 100% event consistency.

### T-M5-03: Chaos Recovery Test Suite
- **Role:** qa
- **Depends On:** T-M5-02
- **Acceptance Criteria:**
  - Automated tests simulate: sudden hub kill during claim transaction, simultaneous duplicate claims, expired lock recovery, clock skew, and 429 rate limit backoff.
  - Asserts SQLite database remains uncorrupted and system resumes clean state.

### T-M5-04: SQLite Hot Backup & Restore Scripts
- **Role:** qa
- **Depends On:** T-M1-02
- **Acceptance Criteria:**
  - `scripts/backup.sh` performs safe hot backup using `sqlite3 .backup`.
  - `scripts/restore.sh` validates and restores database into fresh location.
  - Automated test executes backup during active writes, restores to new DB, and verifies integrity.

### T-M5-05: Structured JSON Logging & Token Redaction Test
- **Role:** qa
- **Depends On:** T-M1-03, T-M1-11
- **Acceptance Criteria:**
  - Fastify server outputs NDJSON structured logs with request ID correlation.
  - Custom log serializer redacts all Authorization headers, token parameters, and secrets.
  - Automated test asserts raw token never appears in log streams under any request scenario.

### T-M5-06: Soak Testing & Final QA Report
- **Role:** qa
- **Depends On:** T-M5-01 through T-M5-05
- **Acceptance Criteria:**
  - Executes simulation soak test.
  - Publishes `docs/QA_REPORT.md` detailing performance benchmarks (p95 latency < 150ms), reliability test results, and filed bug issues.

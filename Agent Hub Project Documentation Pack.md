# Agent Hub: Project Documentation Pack

Nov 1, 2026 · @Miku

## Overview

Agent Hub is a small coordination server that lets five people's Antigravity agents share one task board, message each other, and avoid editing the same files. This pack holds everything needed to build it with Antigravity, then set it up on every laptop.

**Order of use**

1. Create a GitHub repo called `agent-hub` and copy the PRD, TRD, Backend schema, API spec, UI/UX brief and Implementation plan sections into `/docs` as `PRD.md`, `TRD.md`, `SCHEMA.md`, `API.md`, `UIUX.md` and `PLAN.md`.
2. Give each teammate their role file from the Role files section as `AGENTS.md` in their copy of the repo.
3. Paste the build prompts into Antigravity in the order given.
4. When every milestone passes, paste the final prompt to generate the setup and usage guide.

**Assumptions**

- 5 people, each on their own free Antigravity account, on mixed Windows, macOS and Linux laptops.
- Zero paid services. Everything runs on free tiers or on a teammate's machine.
- Antigravity's CLI is `agy`. Its headless flags may differ from what is written here, so run `agy --help` first (see Risks).

**Decision gates.** After Phase 0 and again after Phase 2 of the roadmap, stop and ask whether the lighter manual process is already enough. If it is, skip the rest.

## Roadmap

The build runs in seven phases over about 3 to 4 weeks part-time, and each phase ends at a gate you can check, not a feeling.

| Phase | Goal | Exit gate | Time |
| --- | --- | --- | --- |
| 0. Manual baseline | Shared repo, TASKS.md board, role files, branch-per-agent rule, CI | Each of the 5 members merged one PR made by their agent; CI blocks a failing PR | 2 to 3 days |
| 1. Hub core | SQLite, REST API, tokens, task state machine, messages, file locks | All API tests pass; a full task lifecycle runs from curl | 4 days |
| 2. MCP shim | Stdio MCP server that exposes hub tools to Antigravity | Agents on two different laptops claim tasks and message each other | 3 days |
| 3. Dashboard | React board, agents, inbox, locks, live updates | Board updates live without refresh; usable at phone width | 4 days |
| 4. Daemon | `hubd` watches the hub and runs `agy` headless on assigned tasks | A task created in the UI is finished by an agent on another laptop and ends in a PR | 4 days |
| 5. Hardening | Rate limits, lock expiry, run caps, logs, backups, end-to-end tests | 24-hour soak with 5 agents and no stuck tasks | 3 days |
| 6. Setup and docs | Antigravity writes the setup and usage guide | A teammate sets up from the guide alone in under 30 minutes | 2 days |

**Stop rules.** If Phase 0 already gives you most of the benefit, stop there. If Phase 2 works but the daemon feels unnecessary, skip Phase 4: people start their own agents and still share the board.

**Parallel lanes.** Phases 3 and 4 can run side by side once Phase 1 is done, because the dashboard and the daemon depend only on the API.

## PRD

**Problem.** Five people each run their own Antigravity agent, but the agents cannot see each other's work. They overlap on files, repeat work, and nobody can see who is doing what.

**Product.** Agent Hub is one shared place where agents and humans see the same task board, claim work, send messages, lock files and attach results, at zero cost.

**Users**

| User | Need |
| --- | --- |
| Team member (human) | See what every agent is doing; assign, review and merge |
| Orchestrator agent | Break a goal into tasks, assign roles, watch progress |
| Worker agent (backend, frontend, QA, devops) | Find a task for its role, claim it, ask questions, hand off results |
| Admin (one human) | Create members and tokens, force-release locks, read logs |

**Goals**

1. No two agents edit the same files at once.
2. Every task has an owner, a status and acceptance criteria, visible to everyone.
3. Agents can message each other and humans, and questions and blockers get surfaced.
4. Work reaches the repo only as reviewed PRs.
5. It costs nothing to build or run.

**Non-goals**

- Saving tokens. Agent chat adds tokens; the gain is parallel work and spreading load across 5 free quotas.
- Replacing git, GitHub or code review.
- Hosting models, or sharing or proxying anyone's Google login.
- A public product. This is for one team of 5.

**Features by priority**

| ID | Feature | Priority |
| --- | --- | --- |
| F1 | Task board with status, role, priority, dependencies, acceptance criteria | P0 |
| F2 | Claim and release tasks with conflict-safe updates | P0 |
| F3 | Agent and human messaging (info, question, handoff, blocker) | P0 |
| F4 | File locks with expiry | P0 |
| F5 | MCP tools so Antigravity uses all of the above natively | P0 |
| F6 | Per-member tokens and an audit log | P0 |
| F7 | Web dashboard with live updates | P1 |
| F8 | Artifacts per task: plans, test reports, screenshots, PR links | P1 |
| F9 | Daemon that starts `agy` headless on assigned tasks | P1 |
| F10 | Run caps and a quota guard per member | P1 |
| F11 | Review queue and approval gate | P2 |
| F12 | Slack or Discord notifications | P2 |

**User stories**

- As the orchestrator, I turn a goal into 8 tasks with dependencies, and workers see only the tasks that are unblocked.
- As a backend agent, I lock `apps/hub/src/**` before editing so the frontend agent is warned.
- As a human, I open the board and see that QA is blocked and why, without asking anyone.
- As the admin, I revoke a token the moment a laptop is lost.

**Success metrics (first month, proposed targets)**

- Zero merge conflicts caused by two agents editing the same file.
- At least 70% of tasks go from ready to PR without a human rewriting the task spec.
- Median time from a blocker message to a human reply under 30 minutes.
- Hub uptime above 95% during working hours.

## TRD

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
| Daemon | Node CLI `hubd` using child\_process | Starts `agy` per task and streams output back |
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

## Backend schema

SQLite with WAL mode and foreign keys on. IDs are ULIDs stored as text; timestamps are UTC ISO strings.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('orchestrator','backend','frontend','qa','devops','reviewer')),
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('offline','idle','working','blocked')),
  current_task_id TEXT,
  last_seen_at TEXT,
  daily_run_cap INTEGER NOT NULL DEFAULT 20,
  UNIQUE (member_id, name)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  role_required TEXT,
  priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN
    ('backlog','ready','claimed','in_progress','in_review','blocked','done','cancelled')),
  assignee_agent_id TEXT REFERENCES agents(id),
  branch TEXT,
  pr_url TEXT,
  created_by_member_id TEXT REFERENCES members(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_tasks_board ON tasks(project_id, status, role_required, priority);

CREATE TABLE task_deps (
  task_id TEXT NOT NULL REFERENCES tasks(id),
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id),
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  from_agent_id TEXT REFERENCES agents(id),
  from_member_id TEXT REFERENCES members(id),
  to_agent_id TEXT REFERENCES agents(id),          -- NULL means broadcast
  kind TEXT NOT NULL CHECK (kind IN
    ('info','question','answer','handoff','blocker','review_request')),
  body TEXT NOT NULL,
  reply_to_id TEXT REFERENCES messages(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_inbox ON messages(to_agent_id, created_at);

CREATE TABLE message_reads (
  message_id TEXT NOT NULL REFERENCES messages(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, agent_id)
);

CREATE TABLE file_locks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  task_id TEXT REFERENCES tasks(id),
  path_glob TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_locks_active ON file_locks(project_id, released_at, expires_at);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  agent_id TEXT REFERENCES agents(id),
  kind TEXT NOT NULL CHECK (kind IN ('plan','diff','test_report','screenshot','doc','pr','link')),
  title TEXT NOT NULL,
  uri TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL CHECK (status IN
    ('running','succeeded','failed','timeout','rate_limited','cancelled')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  exit_code INTEGER,
  model TEXT,
  log_path TEXT,
  note TEXT
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  actor_agent_id TEXT,
  actor_member_id TEXT,
  type TEXT NOT NULL,                -- task.claimed, message.created, lock.acquired ...
  payload TEXT NOT NULL,             -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Task status transitions**

| From | To | Who | Condition |
| --- | --- | --- | --- |
| backlog | ready | Orchestrator or human | All dependencies are done |
| ready | claimed | Agent with matching role | Version matches (else 409) |
| claimed | in\_progress | Assignee | Branch is set |
| in\_progress | blocked | Assignee | A blocker message is attached |
| blocked | in\_progress | Assignee or human | Blocker answered |
| in\_progress | in\_review | Assignee | PR artifact attached and locks released |
| in\_review | done | Human | CI is green |
| in\_review | in\_progress | Reviewer or human | Changes requested, with a message |
| claimed or in\_progress | ready | System or human | No heartbeat for 30 minutes |
| any | cancelled | Human or orchestrator | Reason recorded in an event |

**Lock rules**

- A lock request whose glob overlaps an active lock from another agent returns 409 with the owner and task.
- Default time to live is 2 hours; an agent can renew while it works.
- At most 10 active locks per agent.

## API and MCP tool spec

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
| `hub_heartbeat` | Reports status and current task | status, task\_id |
| `hub_list_tasks` | Lists tasks the agent could pick up or is working on | status, role |
| `hub_get_task` | Full task with deps, messages and artifacts | task\_id |
| `hub_claim_task` | Claims a ready task | task\_id, version |
| `hub_update_task_status` | Moves a task to the next allowed state | task\_id, status, note |
| `hub_create_task` | Creates a task (orchestrator role only) | title, description, acceptance\_criteria, role\_required, depends\_on |
| `hub_send_message` | Sends a message | to (agent or all), kind, body, task\_id |
| `hub_read_inbox` | Returns unread messages and marks them read | limit |
| `hub_lock_files` | Locks path globs; returns conflicts | paths, task\_id, ttl\_minutes |
| `hub_release_locks` | Releases the agent's locks | task\_id |
| `hub_add_artifact` | Attaches a result to a task | task\_id, kind, title, uri, summary |

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

## UI/UX brief

The dashboard answers one question at a glance: who is doing what, and what is stuck. It is a calm, dark-first, developer-tool interface that works on a laptop and on a phone.

**Design principles**

1. Status first. Every screen shows state (working, blocked, waiting for review) before detail.
2. Blockers are loud, everything else is quiet. Only blocked tasks and unanswered questions use the danger color.
3. Live by default. Changes appear without refresh and highlight briefly.
4. Humans can always override. Every agent action has a visible undo or reassign path.
5. Keyboard friendly: `g b` board, `g a` agents, `g i` inbox, `/` search, `n` new task.

**Screens**

| Screen | Contents | Key actions |
| --- | --- | --- |
| Sign in | Hub URL and token field; checks `/health` and `/me` | Paste token, continue |
| Board (home) | Columns: Ready, Claimed, In progress, Blocked, In review, Done. Cards show title, role chip, agent avatar, lock icon, dependency count | Drag to reassign, filter by role or agent, create task |
| Task drawer | Tabs: Spec, Activity, Messages, Artifacts, Runs. Header shows status, owner, branch, PR link | Edit spec, approve, request changes, cancel |
| Agents | Cards per agent: role, member, status dot, current task, last seen, daily run usage bar | Pause agent, change daily cap |
| Inbox | Threaded messages grouped by task, filter by kind (question, blocker, handoff) | Reply, mark read, convert blocker to task |
| Locks | Table of active locks with owner, task, expiry countdown | Release (admin: force) |
| Activity | Live event feed with type filters | Jump to task |
| Setup | Member token generation, copy-ready `mcp_config.json`, daemon config, health checks | Generate token, copy snippet, run check |

**Key flows**

1. **Create and run a task.** New task, fill title, spec and acceptance criteria, pick role, set dependencies, then Ready. A matching agent claims it and the card moves with a highlight.
2. **Unblock.** A blocker message turns the card red and adds a banner in the drawer. The human replies in the drawer and the card returns to In progress.
3. **Review and merge.** The card reaches In review with a PR link and a green or red CI chip. The human opens the PR, merges on GitHub, and clicks Approve to move it to Done.

**Design tokens**

| Token | Dark | Light |
| --- | --- | --- |
| Background | #0B0F14 | #F7F8FA |
| Surface | #121821 | #FFFFFF |
| Border | #1F2937 | #E3E7EC |
| Text | #E6EDF3 | #14181F |
| Muted text | #8B98A5 | #5B6672 |
| Accent | #5B8CFF | #2F5FE0 |
| Success | #3FB950 | #1A7F37 |
| Warning | #D29922 | #9A6700 |
| Danger | #F85149 | #CF222E |

- Fonts: Inter for UI, JetBrains Mono for ids, branches and logs.
- 4 px spacing grid, 8 px card radius, 1 px borders, no heavy shadows.
- Role chips use a fixed hue per role (orchestrator violet, backend blue, frontend teal, QA amber, devops gray) and always carry a text label, never color alone.

**States to design**

- Empty: board with no tasks shows a short explanation and a Create task button.
- Loading: skeleton cards, not spinners.
- Offline or hub unreachable: a top banner with a retry timer; the UI stays readable from cache.
- Conflict (409): a toast saying who changed it and offering Reload.
- Error: plain message, a Copy details button, no stack traces.

**Accessibility and responsiveness**

- WCAG AA contrast, visible focus rings, drag and drop always has a menu alternative.
- At phone width the board becomes a single column with a status selector; the drawer becomes a full-screen sheet.
- Respect reduced-motion settings; highlights fade with opacity only.

**Microcopy tone.** Short, factual, no jokes. Example: "Waiting for review. CI passed 4 minutes ago."

## Implementation plan

The five teammates own one lane each, and each lane has its own Antigravity agent and its own build prompt.

**Team split**

| Member | Role | Owns | Build prompt |
| --- | --- | --- | --- |
| A | Orchestrator and architect | Repo scaffold, task breakdown, reviews, merges | Prompt 0 |
| B | Backend | Hub API, schema, auth, locks, events | Prompt 1 |
| C | Frontend | Dashboard | Prompt 3 |
| D | Integrations | MCP shim and `hubd` daemon | Prompts 2 and 4 |
| E | QA and DevOps | CI, tests, tunnel, backups, setup guide | Prompts 5 and 6 |

**Repo layout**

```text
agent-hub/
  AGENTS.md                 shared rules for every agent
  docs/                     PRD, TRD, SCHEMA, API, UIUX, PLAN
  apps/
    hub/                    Fastify server, SQLite, migrations
    web/                    React dashboard
  packages/
    shared/                 zod schemas, types, constants
    mcp-shim/               agent-hub-mcp (stdio MCP server)
    daemon/                 hubd CLI
  scripts/                  setup, doctor, backup
  .github/workflows/ci.yml
```

**Milestones**

| ID | Milestone | Tasks | Definition of done |
| --- | --- | --- | --- |
| M0 | Scaffold | pnpm workspace, TypeScript, lint, Vitest, CI, role files, PR template | CI green on an empty PR |
| M1 | Hub core | Migrations, auth, tasks, claim with versioning, transitions, messages, locks, artifacts, events | API tests cover every transition and lock conflict |
| M2 | MCP shim | All 12 tools, env config, readable errors | Two laptops complete claim, message and handoff through MCP |
| M3 | Dashboard | Board, drawer, agents, inbox, locks, activity, setup, live updates | Playwright smoke test passes; usable at 390 px width |
| M4 | Daemon | Poll or SSE, worktrees, `agy` headless runner, run reports, caps, backoff | A UI-created task ends in a PR with no manual steps |
| M5 | Hardening | Rate limits, lock expiry job, stuck-task reaper, backups, logging | 24-hour soak with 5 agents, no stuck tasks |
| M6 | Docs | Setup and usage guide, doctor command | Fresh-laptop setup in under 30 minutes |

**Working agreements**

- One branch per task: `agent/<role>/<task-id>-<slug>`. One PR per task, under 400 changed lines where possible.
- Conventional commit messages. CI must pass before merge.
- Agents never merge. A human merges, or approves a reviewer agent's review and then merges.
- Agents write a short plan artifact before coding anything larger than a one-file change.
- Anything uncertain becomes a `question` message, not a guess.

**Definition of done for any task**

- [ ] Acceptance criteria all met, each with a test or a recorded check
- [ ] Lint, type-check and tests pass locally and in CI
- [ ] Docs updated if behavior changed
- [ ] Locks released, PR linked as an artifact, status set to in\_review

## Role files (AGENTS.md)

Place the shared rules in the repo root `AGENTS.md`. Each person adds their role block below it in their own clone, and also saves it as the agent's custom instructions if their Antigravity setup supports it. Antigravity reads `AGENTS.md` and `GEMINI.md`.

**Shared rules (everyone)**

```markdown
# Agent Hub: shared rules

You are one of several AI agents building Agent Hub with a team of humans.
A coordination hub is available through the `agent-hub` MCP tools.

## Always
1. At the start of a session call `hub_whoami`, then `hub_heartbeat`, then `hub_read_inbox`.
2. Work only on a task you have claimed with `hub_claim_task`. If none, list ready tasks for your role.
3. Before editing files call `hub_lock_files` with the narrowest globs. If a lock conflicts, pick another task or message the owner. Never edit locked paths.
4. Work on branch `agent/<role>/<task-id>-<slug>` in your own git worktree.
5. For anything bigger than a one-file change, attach a short plan with `hub_add_artifact` first.
6. If requirements are unclear or blocked, send a `question` or `blocker` message. Do not guess.
7. Finish by: tests passing, PR opened, PR attached as an artifact, locks released, status set to in_review.

## Never
- Merge to main, force push, or rewrite shared history.
- Touch files outside your task's scope or outside the repo.
- Commit secrets, tokens or .env files.
- Mark a task done. Only a human does that.
- Use auto-approve or unrestricted modes unless a human enabled them for this task.

## Style
- TypeScript strict mode, small functions, tests next to code.
- Messages to other agents: 1 to 5 lines, say what you need and by when.
- Read docs/PRD.md, docs/TRD.md, docs/SCHEMA.md and docs/API.md before your first task.
```

**Role blocks**

```markdown
## Role: orchestrator
You plan, you do not write feature code.
- Turn goals into tasks of at most half a day, each with acceptance criteria, role_required and depends_on.
- Keep the board tidy: split big tasks, cancel duplicates, answer questions from workers.
- Create tasks with hub_create_task. Move backlog tasks to ready when dependencies are done.
- Review PRs against acceptance criteria and post findings as messages.

## Role: backend
You own apps/hub and packages/shared.
- Follow docs/SCHEMA.md and docs/API.md exactly. Propose changes as a question message first.
- Every endpoint needs input validation (zod), tests and a clear error code.
- Every state change writes an events row.

## Role: frontend
You own apps/web.
- Follow docs/UIUX.md for screens, tokens, states and accessibility.
- Use only the documented REST and SSE endpoints. Missing endpoint? Message the backend agent.
- Provide screenshots of each screen as artifacts.

## Role: integrations
You own packages/mcp-shim and packages/daemon.
- Tool results must be short and actionable. Errors must say what to do next.
- The daemon must never run agents outside its git worktree, never pass auto-approve flags by default, and must enforce run caps and timeouts.
- Verify real agy flags with agy --help before coding and record them in docs/AGY_NOTES.md.

## Role: qa
You own tests, CI and scripts.
- Write tests that fail first. Cover every status transition and every lock conflict.
- Break things on purpose: duplicate claims, expired locks, hub restarts, rate-limit responses.
- Report bugs as tasks for the owning role, with reproduction steps.

## Role: reviewer
You review PRs, you do not write code.
- Check acceptance criteria, tests, security rules and docs. Post a review_request response as a message.
- Approve only when every item in the definition of done is met.
```

## Build prompts for Antigravity

Paste one prompt per agent, in the order below. Each prompt tells the agent which docs to read first, so copy the docs into the repo before starting.

- Until the hub and MCP shim exist (end of M2), the hub tools in `AGENTS.md` are not available. Coordinate through `docs/TASKS.md`, branch names and PR comments instead.
- After a prompt finishes, a human reviews the PR before the next prompt starts. Prompts 1 and 2 can run in parallel; Prompts 3 and 4 can run in parallel after M1.
- If an agent asks a question, answer it in the PR or chat rather than letting it guess.

**Prompt 0: Scaffold and task breakdown (orchestrator, Member A)**

```text
You are the orchestrator agent for the Agent Hub project.

Read AGENTS.md and docs/PRD.md, docs/TRD.md, docs/SCHEMA.md, docs/API.md, docs/UIUX.md and docs/PLAN.md fully before doing anything.

Goal: create the repository scaffold and the first task breakdown. Do not implement features.

Do:
1. Create a pnpm workspace monorepo exactly as in the repo layout in docs/PLAN.md (apps/hub, apps/web, packages/shared, packages/mcp-shim, packages/daemon, scripts).
2. Set up TypeScript strict mode, ESLint, Prettier and Vitest, with root scripts: dev, build, lint, typecheck, test.
3. Add .github/workflows/ci.yml that runs install, lint, typecheck and test on pull requests.
4. Add a PR template containing the definition-of-done checklist from docs/PLAN.md, a .gitignore (node_modules, .env, *.db, logs) and a .env.example with placeholders for HUB_URL, HUB_TOKEN and HUB_AGENT_NAME.
5. Write docs/TASKS.md listing every task for milestones M1 to M5. Each task has an id, title, role_required, depends_on and acceptance criteria, and is at most half a day of work.
6. Run `agy --help` and `agy --version` and record the output in docs/AGY_NOTES.md. If agy is not installed, write that down and skip this step.

Constraints: no feature code, no secrets, no paid services, no network calls except package installs.
Finish: open one PR for the scaffold. List every assumption you made in the PR description.
```

**Prompt 1: Hub core (backend, Member B)**

```text
You are the backend agent. Read AGENTS.md, docs/SCHEMA.md, docs/API.md, docs/TRD.md and docs/TASKS.md.

Build apps/hub: a Fastify + TypeScript server using better-sqlite3 that implements milestone M1.

Scope:
- Migrations that create exactly the tables in docs/SCHEMA.md, run automatically at startup.
- Bearer-token auth. Tokens are 32-byte random values; store only their SHA-256 hash. On first start with an empty database, create one admin member and print its token once.
- Every REST endpoint in docs/API.md, with zod validation and the error format from the spec.
- The task status transitions from docs/SCHEMA.md. Invalid transitions return 409 with the list of allowed next states.
- Optimistic locking through the task version field. Claiming must be safe under concurrency: two simultaneous claims, exactly one wins.
- File lock overlap detection for globs (for example src/** conflicts with src/a/b.ts), with TTL and renewal.
- An events row written in the same transaction as every state change.
- GET /events/stream as Server-Sent Events, with Last-Event-ID resume.
- Background jobs: expire locks, and return tasks with no heartbeat for 30 minutes to ready.
- A simple rate limit of 100 requests per minute per token.

Tests (Vitest): every valid and invalid transition, the claim race, lock overlap cases, token revoke, SSE resume.

Constraints: do not change the schema or API without sending a question message first; no external services; start command: pnpm --filter hub dev.
Done: all M1 acceptance criteria in docs/TASKS.md pass; scripts/demo-lifecycle.sh runs a full task lifecycle with curl; PR opened with test output.
```

**Prompt 2: MCP shim (integrations, Member D)**

```text
You are the integrations agent. Read AGENTS.md, docs/API.md (MCP tools section) and docs/AGY_NOTES.md.

Build packages/mcp-shim: a stdio MCP server using the official MCP TypeScript SDK. It exposes the 12 tools listed in docs/API.md and calls the hub REST API.

Requirements:
- Configuration from the environment: HUB_URL, HUB_TOKEN, HUB_AGENT_NAME. Fail fast with a clear message if any is missing.
- Each tool has a zod input schema and returns a short plain-text result plus a compact JSON block. Errors say what to do next; map 409 responses to guidance such as who holds a lock and until when.
- hub_read_inbox marks returned messages as read.
- Add a --selftest flag that calls hub_whoami and prints OK or the reason it failed.
- Provide examples/mcp_config.json and a README section on registering the shim in Antigravity. Look up the real config location in Antigravity's documentation; if you cannot confirm it, say so instead of guessing.
- Tests with a mocked hub, plus one integration test against the real hub from M1.

Constraints: never log tokens; make no network calls except to HUB_URL.
Done: M2 acceptance criteria pass; run hub_whoami from Antigravity itself and paste the output into the PR.
```

**Prompt 3: Dashboard (frontend, Member C)**

```text
You are the frontend agent. Read AGENTS.md, docs/UIUX.md and docs/API.md.

Build apps/web with React, Vite, TypeScript, Tailwind and TanStack Query. The build output is static files that apps/hub serves at /.

Implement every screen in docs/UIUX.md: Sign in, Board, Task drawer, Agents, Inbox, Locks, Activity and Setup.

Requirements:
- Design tokens exactly as in docs/UIUX.md, as CSS variables, dark by default with a light theme toggle.
- Live updates through GET /events/stream. On each event, invalidate the matching queries and briefly highlight the changed card. Reconnect with backoff and Last-Event-ID.
- Every state in docs/UIUX.md: empty, loading skeletons, offline banner, 409 conflict toast, and errors.
- Board drag and drop only allows valid transitions, and every drag has a keyboard or menu alternative.
- The keyboard shortcuts from the brief, WCAG AA contrast and visible focus rings.
- Responsive: single-column board and full-screen drawer at 390 px width.
- Keep the token in localStorage only and never log it.
- Use a mock API (MSW) so you can work before backend endpoints land, and switch to the real API with an environment variable.

Tests: Vitest for components and one Playwright smoke test (sign in, create a task, see it on the board, see a live update).
Deliver: screenshots of every screen at desktop width and at 390 px, attached to the PR.
Done: M3 acceptance criteria pass; PR opened.
```

**Prompt 4: Daemon (integrations, Member D)**

```text
You are the integrations agent. Read AGENTS.md, docs/TRD.md (daemon and reliability rules) and docs/AGY_NOTES.md.

Build packages/daemon: hubd, a CLI that runs on one member's laptop.

Behavior:
1. Config file at ~/.agent-hub/hubd.json with hubUrl, token, agentName, role, repoPath, maxRunsPerDay, runTimeoutMinutes (default 45), agyPath, autoApprove (default false) and an optional model.
2. Every 15 seconds (or through SSE when available) fetch ready tasks for the agent's role and tasks already assigned to it.
3. For a task: create a git worktree on branch agent/<role>/<task-id>-<slug>; build a prompt from the task title, description, acceptance criteria, related messages and links to docs; run agy headless using the flags recorded in docs/AGY_NOTES.md; stream output to a log file; report the run with POST /runs and PATCH /runs/:id.
4. Enforce the daily run cap, the timeout, one run at a time, and a paused flag from the hub. On rate-limit style failures mark the run rate_limited, back off exponentially up to 30 minutes, and message the orchestrator.
5. Never pass auto-approve flags unless autoApprove is true. Never run outside the worktree. Never push to main.
6. After a run, if the branch has commits, push the branch and report it. Never merge. If the agent exited without setting a status, set the task to blocked with a note.
7. Commands: hubd init, hubd start, hubd status, hubd stop, hubd doctor.

Tests: use a fake agy script that simulates success, failure, timeout and rate limiting.
Done: M4 acceptance criteria pass; a task created in the dashboard ends as a pushed branch with no manual steps. Include the terminal output in the PR.
```

**Prompt 5: Hardening and QA (QA and DevOps, Member E)**

```text
You are the QA and DevOps agent. Read AGENTS.md, docs/PLAN.md (M5) and docs/TRD.md.

Goal: harden the system and prove it works.

1. CI: matrix on ubuntu, macos and windows for build, lint, typecheck and unit tests; a Playwright smoke job on ubuntu; a secret-scanning step.
2. Simulation: scripts/sim-agents.ts starts the hub and 5 fake agents that claim tasks, lock files, message each other and finish tasks. Provide a short mode for CI (30 minutes) and a soak mode (24 hours). Assert no stuck tasks, no overlapping locks and no lost events.
3. Chaos tests: kill the hub mid-claim, duplicate claims, expired locks, clock skew and 429 responses. Verify recovery.
4. Backups: scripts/backup.sh and scripts/restore.sh using sqlite3 .backup, with a test that restores into a fresh database.
5. Logging: structured JSON logs with a request id, and a test proving tokens never appear in logs.
6. Write docs/QA_REPORT.md with results, then file each open bug as a task for the owning role.

Constraints: no paid services.
Done: M5 acceptance criteria pass; PR opened with the QA report.
```

## Final prompt: setup and usage guide

Run this only after milestones M0 to M5 are merged and CI is green. It makes Antigravity write, and then test, the guide for installing Agent Hub on every laptop and using it day to day.

**Prompt 6: Setup and usage guide (QA and DevOps, Member E)**

```text
You are the QA and DevOps agent. Milestones M0 to M5 are merged. Read AGENTS.md and everything in docs/.

Goal: produce a setup and usage guide that takes a teammate with a fresh laptop from nothing to a working agent in under 30 minutes. Verify every command you document by running it. Mark anything you could not run as UNVERIFIED.

Deliverables, all in docs/guide/ unless noted:

1. SETUP.md: prerequisites, then separate sections for Windows (PowerShell), macOS and Linux. Cover installing Node 20+, git and pnpm; installing the Antigravity IDE and the agy CLI (use the official Antigravity docs for current install commands, link them, and do not guess); cloning and building the repo; configuring .env; creating a member and token (admin steps versus member steps); registering the MCP shim in Antigravity with the exact config file path per OS if documented; running hubd init and hubd doctor; and a first-task smoke test. Every step shows the expected output.
2. HOST.md: for the one person who hosts the hub. Cover running the hub, exposing it with a free Cloudflare Tunnel, backups and restore, upgrading, rotating and revoking tokens, and what to do when the host laptop sleeps or restarts.
3. USAGE.md: the daily workflow for a member, the orchestrator and the reviewer. Include how to write a good task (with examples), how to read the board, how to handle blockers, how to review and merge a PR, and team etiquette for locks and messages. List the screenshots that should be added.
4. TROUBLESHOOTING.md: a table of symptom, cause and fix. Cover at least: token rejected, MCP tools not showing in Antigravity, agy not found, rate limit or quota reached, lock conflicts, stuck task, hub unreachable, port already in use, and Windows path or line-ending problems.
5. scripts/bootstrap.sh and scripts/bootstrap.ps1: idempotent scripts that check prerequisites, install dependencies, build, copy .env.example to .env and print the next steps.
6. Extend hubd doctor to check: Node version, git, agy present, hub reachable, token valid, MCP shim self-test and worktree writable. Print pass or fail with a fix hint for each.
7. docs/guide/CHEATSHEET.md: a single page of the commands and daily steps.

Verification:
- Run the whole setup in a clean Linux Docker container and record the result.
- State plainly what you could not test on Windows and macOS.
- Ask a reviewer agent to follow SETUP.md literally, record every point of confusion, then fix the guide.

Constraints: use placeholders for tokens and URLs, never real ones; plain language; short numbered steps; no step without an expected result.
Finish: open a PR and list all UNVERIFIED items at the top of the description.
```

**After the PR merges**

1. Each teammate follows `SETUP.md` on their own laptop and runs `hubd doctor`.
2. Time one person doing it from scratch. If it takes more than 30 minutes, paste their notes back to the agent and ask it to fix the guide.
3. Run one real task end to end as a team before relying on the system.

## Risks and things to verify

The biggest risks are free-tier limits and agents drifting apart, and both are handled by caps, small tasks and human merges.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Free quota shrinks or runs out | Agents stop mid-task | Daily run caps, backoff on rate limits, keep the Phase 0 manual process usable without agents, one account per person |
| Terms or account issues from automation | Account restrictions | Each person uses their own account with normal sign-in; no shared logins or reused session tokens; read Antigravity's terms before scheduling headless runs |
| Agents conflict or drift | Broken main branch | File locks, small tasks, human merge, CI gate, reviewer agent |
| `agy` flags differ from this pack | Daemon fails | Record real flags in `docs/AGY_NOTES.md` first; keep flags configurable |
| Remote MCP support missing or changed | Tools do not appear | Default to the local stdio shim |
| Hub host sleeps or goes offline | Agents idle | Use an always-on machine; daemon queues updates; heartbeat reaper returns stuck tasks |
| More tokens used, not fewer | Quota burns faster | Short messages and tool results, plans only for larger tasks, run caps |
| Secrets leak into prompts or logs | Security incident | `.env` ignored by git, tokens never logged, secret scan in CI |
| Runaway agent loops | Wasted quota, messy branches | Timeouts, one run at a time, run caps |
| OS differences | Setup failures | Bootstrap scripts for bash and PowerShell, CI matrix on three operating systems |

**Verify before you start**

- [ ] `agy --help` and the real headless flags (prompt, output format, non-interactive, model)
- [ ] Where Antigravity reads `mcp_config.json` on each OS
- [ ] Current free-tier quota on each person's account
- [ ] Antigravity's terms for automated or headless use
- [ ] A free tunnel option is still free and allowed for your use
- [ ] Node 20+ and pnpm install cleanly on all 5 laptops
- [ ] Whether the Antigravity SDK or Managed Agents API is usable without paying (this pack does not depend on it)

**Sources**

- [Antigravity pricing breakdown, CloudZero](https://www.cloudzero.com/blog/google-antigravity-pricing/): free tier, weekly quota, repeated limit cuts since launch
- [Antigravity CLI overview, howaiworks.ai](https://howaiworks.ai/ai-tools/google-antigravity): MCP via `mcp_config.json`, `AGENTS.md` and `GEMINI.md` support, subagents
- [agy headless adapter notes, docs.rs](https://docs.rs/crate/atomr-agents-coding-cli-vendor-antigravity/latest/source/README.md): headless invocation pattern, flags marked as needing confirmation

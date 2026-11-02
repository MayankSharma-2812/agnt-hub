# Implementation Plan: Agent Hub

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
- [ ] Locks released, PR linked as an artifact, status set to in_review

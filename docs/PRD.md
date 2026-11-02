# PRD: Agent Hub

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

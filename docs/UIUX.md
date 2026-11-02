# UI/UX Brief: Agent Hub

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

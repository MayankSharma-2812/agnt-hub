# Backend Schema: Agent Hub

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
| claimed | in_progress | Assignee | Branch is set |
| in_progress | blocked | Assignee | A blocker message is attached |
| blocked | in_progress | Assignee or human | Blocker answered |
| in_progress | in_review | Assignee | PR artifact attached and locks released |
| in_review | done | Human | CI is green |
| in_review | in_progress | Reviewer or human | Changes requested, with a message |
| claimed or in_progress | ready | System or human | No heartbeat for 30 minutes |
| any | cancelled | Human or orchestrator | Reason recorded in an event |

**Lock rules**

- A lock request whose glob overlaps an active lock from another agent returns 409 with the owner and task.
- Default time to live is 2 hours; an agent can renew while it works.
- At most 10 active locks per agent.

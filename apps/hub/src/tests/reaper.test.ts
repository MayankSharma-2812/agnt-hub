import { describe, it, expect } from 'vitest';
import { initDatabase } from '../db/database.js';
import { runReaper } from '../services/reaper.js';
import { generateUlid } from '../services/ulid.js';

describe('Background Reaper Service', () => {
  it('expires file locks past their expires_at timestamp', () => {
    const { db } = initDatabase(':memory:');
    const memberId = generateUlid();
    const agentId = generateUlid();
    const projectId = generateUlid();

    db.prepare("INSERT INTO members (id, name) VALUES (?, 'Test Member')").run(memberId);
    db.prepare("INSERT INTO agents (id, member_id, name, role) VALUES (?, ?, 'Agent', 'backend')").run(agentId, memberId);
    db.prepare("INSERT INTO projects (id, name) VALUES (?, 'Test Project')").run(projectId);

    // Insert active lock expired 10 minutes ago
    db.prepare(`
      INSERT INTO file_locks (id, project_id, agent_id, path_glob, expires_at)
      VALUES ('lock-expired', ?, ?, 'src/old/**', datetime('now', '-10 minutes'))
    `).run(projectId, agentId);

    // Insert active lock expiring in 60 minutes
    db.prepare(`
      INSERT INTO file_locks (id, project_id, agent_id, path_glob, expires_at)
      VALUES ('lock-valid', ?, ?, 'src/valid/**', datetime('now', '+60 minutes'))
    `).run(projectId, agentId);

    const result = runReaper(db);
    expect(result.expiredLocks).toBe(1);

    const expiredLock = db.prepare('SELECT * FROM file_locks WHERE id = ?').get('lock-expired') as { released_at: string | null };
    expect(expiredLock.released_at).not.toBeNull();

    const validLock = db.prepare('SELECT * FROM file_locks WHERE id = ?').get('lock-valid') as { released_at: string | null };
    expect(validLock.released_at).toBeNull();
  });

  it('reverts claimed or in_progress tasks without heartbeat for 30m back to ready', () => {
    const { db } = initDatabase(':memory:');
    const memberId = generateUlid();
    const staleAgentId = generateUlid();
    const activeAgentId = generateUlid();
    const projectId = generateUlid();

    db.prepare("INSERT INTO members (id, name) VALUES (?, 'Test Member')").run(memberId);
    db.prepare("INSERT INTO projects (id, name) VALUES (?, 'Test Project')").run(projectId);

    // Stale agent (last seen 45 minutes ago)
    db.prepare(`
      INSERT INTO agents (id, member_id, name, role, last_seen_at)
      VALUES (?, ?, 'Stale Agent', 'backend', datetime('now', '-45 minutes'))
    `).run(staleAgentId, memberId);

    // Active agent (last seen 2 minutes ago)
    db.prepare(`
      INSERT INTO agents (id, member_id, name, role, last_seen_at)
      VALUES (?, ?, 'Active Agent', 'backend', datetime('now', '-2 minutes'))
    `).run(activeAgentId, memberId);

    // Task claimed by stale agent
    const taskIdStale = generateUlid();
    db.prepare(`
      INSERT INTO tasks (id, project_id, title, status, assignee_agent_id)
      VALUES (?, ?, 'Stale Task', 'claimed', ?)
    `).run(taskIdStale, projectId, staleAgentId);

    // Task in progress by active agent
    const taskIdActive = generateUlid();
    db.prepare(`
      INSERT INTO tasks (id, project_id, title, status, assignee_agent_id)
      VALUES (?, ?, 'Active Task', 'in_progress', ?)
    `).run(taskIdActive, projectId, activeAgentId);

    const result = runReaper(db);
    expect(result.revertedTasks).toBe(1);

    const staleTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskIdStale) as { status: string; assignee_agent_id: string | null };
    expect(staleTask.status).toBe('ready');
    expect(staleTask.assignee_agent_id).toBeNull();

    const activeTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskIdActive) as { status: string };
    expect(activeTask.status).toBe('in_progress');
  });
});

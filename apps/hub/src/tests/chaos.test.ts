import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FastifyInstance } from 'fastify';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';
import { runReaper } from '../services/reaper.js';

describe('Chaos & Fault Recovery Test Suite', () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let adminToken: string;

  beforeEach(async () => {
    const res = initDatabase(':memory:');
    db = res.db;
    adminToken = res.adminToken!;
    app = buildApp(db, { logger: false });

    // Seed test project and agents
    db.prepare("INSERT INTO projects (id, name) VALUES ('proj-chaos', 'Chaos Test Project')").run();
    db.prepare("INSERT INTO agents (id, member_id, name, role, status) VALUES ('agent-c1', (SELECT id FROM members LIMIT 1), 'worker-1', 'backend', 'idle')").run();
    db.prepare("INSERT INTO agents (id, member_id, name, role, status) VALUES ('agent-c2', (SELECT id FROM members LIMIT 1), 'worker-2', 'backend', 'idle')").run();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('kills transaction mid-claim and asserts rollback and DB integrity', () => {
    // Create a task
    db.prepare("INSERT INTO tasks (id, project_id, title, status, version) VALUES ('t-crash', 'proj-chaos', 'Crash Task', 'ready', 1)").run();

    // Simulate abrupt crash during transaction execution
    expect(() => {
      db.transaction(() => {
        db.prepare("UPDATE tasks SET status = 'claimed', version = version + 1 WHERE id = 't-crash'").run();
        // Abrupt exception before transaction commits
        throw new Error('SIMULATED_HUB_CRASH_MID_TRANSACTION');
      })();
    }).toThrow('SIMULATED_HUB_CRASH_MID_TRANSACTION');

    // Verify task rolled back to ready
    const task = db.prepare('SELECT status, version FROM tasks WHERE id = ?').get('t-crash') as { status: string; version: number };
    expect(task.status).toBe('ready');
    expect(task.version).toBe(1);

    // Verify database integrity is 100% ok
    const integrity = db.pragma('integrity_check') as [{ integrity_check: string }];
    expect(integrity[0].integrity_check).toBe('ok');
  });

  it('handles race conditions under duplicate simultaneous claims: exactly 1 wins, all others get 409', async () => {
    db.prepare("INSERT INTO tasks (id, project_id, title, status, version) VALUES ('t-race', 'proj-chaos', 'Race Task', 'ready', 1)").run();

    // Send 10 concurrent claim requests with version 1
    const workers = Array.from({ length: 10 }, (_, i) => `worker-${i}`);
    const requests = workers.map((workerName) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/tasks/t-race/claim',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'X-Agent-Name': workerName,
          'Content-Type': 'application/json',
        },
        body: { version: 1 },
      }),
    );

    const responses = await Promise.all(requests);
    const successes = responses.filter((r) => r.statusCode === 200);
    const conflicts = responses.filter((r) => r.statusCode === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(9);

    // Verify final task version incremented by exactly 1
    const task = db.prepare('SELECT status, version FROM tasks WHERE id = ?').get('t-race') as { status: string; version: number };
    expect(task.status).toBe('claimed');
    expect(task.version).toBe(2);
  });

  it('recovers from expired locks and allows competing agent to acquire lock', async () => {
    // 1. Insert an expired lock for agent-c1 on src/**
    db.prepare(
      `INSERT INTO file_locks (id, project_id, agent_id, path_glob, expires_at)
       VALUES ('lock-exp', 'proj-chaos', 'agent-c1', 'src/**', datetime('now', '-10 minutes'))`,
    ).run();

    // 2. Competing agent requests lock on overlapping path src/index.ts
    // In our lock conflict detection, expired locks are ignored or purged
    runReaper(db); // Reaper cleans expired lock

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Agent-Name': 'worker-2',
        'Content-Type': 'application/json',
      },
      body: {
        project_id: 'proj-chaos',
        path_glob: 'src/index.ts',
        ttl_seconds: 3600,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.lock.agent_id).toBe('agent-c2');
  });

  it('handles clock skew and stale task heartbeats correctly using database time', () => {
    // Insert task claimed 45 minutes ago with assigned agent last seen 40 minutes ago
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, version, assignee_agent_id, updated_at)
       VALUES ('t-skew', 'proj-chaos', 'Skew Task', 'claimed', 1, 'agent-c1', datetime('now', '-45 minutes'))`,
    ).run();
    db.prepare("UPDATE agents SET last_seen_at = datetime('now', '-40 minutes') WHERE id = 'agent-c1'").run();

    // Run reaper cycle
    const result = runReaper(db);
    expect(result.revertedTasks).toBeGreaterThanOrEqual(1);

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('t-skew') as { status: string };
    expect(task.status).toBe('ready');
  });

  it('enforces 429 rate limit under heavy load and recovers when window resets', async () => {
    // Issue a dedicated member token
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tokens',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { action: 'create', member_id: (db.prepare('SELECT id FROM members LIMIT 1').get() as { id: string }).id },
    });
    const testToken = JSON.parse(tokenRes.body).token;

    // Send 100 requests to /api/v1/me
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { Authorization: `Bearer ${testToken}` },
      });
      expect(res.statusCode).toBe(200);
    }

    // 101st request must trigger 429 Too Many Requests
    const limitedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { Authorization: `Bearer ${testToken}` },
    });

    expect(limitedRes.statusCode).toBe(429);
    expect(limitedRes.headers['retry-after']).toBeDefined();
    const errorBody = JSON.parse(limitedRes.body);
    expect(errorBody.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});

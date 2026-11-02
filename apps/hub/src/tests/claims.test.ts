import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

describe('Task Claims & Concurrency', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let projectId: string;

  beforeEach(async () => {
    const res = initDatabase(':memory:');
    adminToken = res.adminToken!;
    app = buildApp(res.db);

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Claim Test Project' },
    });
    projectId = JSON.parse(projRes.body).project.id;
  });

  it('rejects claim if version does not match', async () => {
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Versioned Task' },
    });
    const task = JSON.parse(taskRes.body).task;

    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-1' },
      payload: { version: 999 }, // Deliberately wrong version
    });

    expect(claimRes.statusCode).toBe(409);
    expect(JSON.parse(claimRes.body).error.code).toBe('VERSION_CONFLICT');
  });

  it('handles claim race condition where only one simultaneous claim wins', async () => {
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Contested Task' },
    });
    const task = JSON.parse(taskRes.body).task;

    // Simulate 2 concurrent claims targeting the same task version
    const [claim1, claim2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${task.id}/claim`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-alpha' },
        payload: { version: task.version },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${task.id}/claim`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-beta' },
        payload: { version: task.version },
      }),
    ]);

    const statuses = [claim1.statusCode, claim2.statusCode].sort();
    // Exactly one 200 OK and one 409 Conflict
    expect(statuses).toEqual([200, 409]);

    const winner = claim1.statusCode === 200 ? claim1 : claim2;
    const loser = claim1.statusCode === 409 ? claim1 : claim2;

    expect(JSON.parse(winner.body).task.status).toBe('claimed');
    expect(JSON.parse(loser.body).error.code).toMatch(/VERSION_CONFLICT|TASK_NOT_READY|CLAIM_RACE_LOST/);
  });
});

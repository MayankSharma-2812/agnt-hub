import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

describe('Task Status Transitions & Dependencies', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let projectId: string;

  beforeEach(async () => {
    const res = initDatabase(':memory:');
    adminToken = res.adminToken!;
    app = buildApp(res.db);

    // Create project
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Transition Test Project' },
    });
    projectId = JSON.parse(projRes.body).project.id;
  });

  it('allows valid transitions along the complete lifecycle', async () => {
    // 1. Create ready task (no deps)
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Build Core' },
    });
    const task = JSON.parse(taskRes.body).task;
    expect(task.status).toBe('ready');

    // 2. Claim task
    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-agent-name': 'backend-agent',
      },
      payload: { version: task.version },
    });
    expect(claimRes.statusCode).toBe(200);
    const claimed = JSON.parse(claimRes.body).task;
    expect(claimed.status).toBe('claimed');

    // 3. Move claimed -> in_progress
    const inProgRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'in_progress', branch: 'agent/backend/build-core' },
    });
    expect(inProgRes.statusCode).toBe(200);
    expect(JSON.parse(inProgRes.body).task.status).toBe('in_progress');

    // 4. Move in_progress -> blocked
    const blockedRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'blocked', note: 'Waiting for spec clarification' },
    });
    expect(blockedRes.statusCode).toBe(200);
    expect(JSON.parse(blockedRes.body).task.status).toBe('blocked');

    // 5. Move blocked -> in_progress
    const unblockRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'in_progress' },
    });
    expect(unblockRes.statusCode).toBe(200);
    expect(JSON.parse(unblockRes.body).task.status).toBe('in_progress');

    // 6. Move in_progress -> in_review
    const reviewRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'in_review', pr_url: 'https://github.com/org/repo/pull/1' },
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(JSON.parse(reviewRes.body).task.status).toBe('in_review');

    // 7. Move in_review -> done
    const doneRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'done' },
    });
    expect(doneRes.statusCode).toBe(200);
    expect(JSON.parse(doneRes.body).task.status).toBe('done');
  });

  it('rejects invalid status transitions with 409 and allowed states', async () => {
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Invalid Move' },
    });
    const task = JSON.parse(taskRes.body).task;

    // Try transitioning ready directly to done
    const invalidRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'done' },
    });

    expect(invalidRes.statusCode).toBe(409);
    const body = JSON.parse(invalidRes.body);
    expect(body.error.code).toBe('INVALID_TRANSITION');
    expect(body.error.allowed).toContain('claimed');
    expect(body.error.allowed).toContain('cancelled');
    expect(body.error.allowed).not.toContain('done');
  });

  it('moves backlog tasks to ready when all dependencies reach done', async () => {
    // Task A (independent)
    const taskARes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Task A' },
    });
    const taskA = JSON.parse(taskARes.body).task;
    expect(taskA.status).toBe('ready');

    // Task B (depends on Task A)
    const taskBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Task B', depends_on: [taskA.id] },
    });
    const taskB = JSON.parse(taskBRes.body).task;
    expect(taskB.status).toBe('backlog');

    // Fast-forward Task A to in_review then done
    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskA.id}/claim`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-a' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskA.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'in_progress' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskA.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'in_review' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskA.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'done' },
    });

    // Check Task B is now ready
    const checkB = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${taskB.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(checkB.body).task.status).toBe('ready');
  });
});

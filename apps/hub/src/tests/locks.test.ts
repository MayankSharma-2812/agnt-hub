import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

describe('File Locks & Glob Overlap Detection', () => {
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
      payload: { name: 'Lock Test Project' },
    });
    projectId = JSON.parse(projRes.body).project.id;
  });

  it('detects glob overlap between different agents and rejects with 409', async () => {
    // Agent 1 locks src/**
    const lock1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-1' },
      payload: { project_id: projectId, path_glob: 'src/**' },
    });
    expect(lock1Res.statusCode).toBe(201);

    // Agent 2 attempts to lock src/a/b.ts -> Should conflict (409)
    const lock2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-2' },
      payload: { project_id: projectId, path_glob: 'src/a/b.ts' },
    });
    expect(lock2Res.statusCode).toBe(409);
    const body2 = JSON.parse(lock2Res.body);
    expect(body2.error.code).toBe('LOCK_CONFLICT');

    // Agent 2 attempts to lock apps/web/** -> Should succeed (no overlap)
    const lock3Res = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-2' },
      payload: { project_id: projectId, path_glob: 'apps/web/**' },
    });
    expect(lock3Res.statusCode).toBe(201);
  });

  it('allows same agent to renew their active lock', async () => {
    const lockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-1' },
      payload: { project_id: projectId, path_glob: 'packages/shared/**' },
    });
    const lock = JSON.parse(lockRes.body).lock;

    // Renew with same agent
    const renewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-1' },
      payload: { project_id: projectId, path_glob: 'packages/shared/**', ttl_minutes: 180 },
    });
    expect(renewRes.statusCode).toBe(201);
    expect(JSON.parse(renewRes.body).lock.id).toBe(lock.id);
  });

  it('allows releasing locks and permits another agent to acquire afterwards', async () => {
    const lockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-1' },
      payload: { project_id: projectId, path_glob: 'docs/**' },
    });
    const lockId = JSON.parse(lockRes.body).lock.id;

    // Release
    const releaseRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/locks/${lockId}`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-1' },
    });
    expect(releaseRes.statusCode).toBe(200);

    // Agent 2 can now acquire docs/**
    const acquireRes = await app.inject({
      method: 'POST',
      url: '/api/v1/locks',
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'agent-2' },
      payload: { project_id: projectId, path_glob: 'docs/**' },
    });
    expect(acquireRes.statusCode).toBe(201);
  });
});

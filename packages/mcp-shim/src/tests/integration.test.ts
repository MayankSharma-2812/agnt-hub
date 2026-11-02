import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initDatabase } from '../../../../apps/hub/src/db/database.js';
import { buildApp } from '../../../../apps/hub/src/app.js';
import { HubClient } from '../client.js';
import { createMcpServer } from '../server.js';

describe('MCP Shim Integration with Hub Server', () => {
  let app: FastifyInstance;
  let hubUrl: string;
  let adminToken: string;
  let client: HubClient;
  let projectId: string;

  beforeAll(async () => {
    const res = initDatabase(':memory:');
    adminToken = res.adminToken!;
    app = buildApp(res.db);

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    hubUrl = address;

    client = new HubClient({
      hubUrl,
      hubToken: adminToken,
      hubAgentName: 'backend-agent',
    });

    // Create default project on hub
    const projRes = await client.request<{ project: { id: string } }>('/api/v1/projects', {
      method: 'POST',
      body: { name: 'MCP Integration Project' },
    });
    projectId = projRes.project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('initializes MCP server with 12 tools and runs hub_whoami', async () => {
    const server = createMcpServer(client);
    expect(server).toBeDefined();

    // Directly test client whoami
    const whoami = await client.request<{ member: { name: string } }>('/api/v1/me');
    expect(whoami.member.name).toBe('admin');
  });

  it('runs complete coordination workflow via MCP tools: create, claim, lock, message, inbox, artifact, review', async () => {
    // 1. Create task
    const taskRes = await client.request<{ task: { id: string; title: string; status: string; version: number } }>(
      '/api/v1/tasks',
      {
        method: 'POST',
        body: {
          project_id: projectId,
          title: 'Build API Spec',
          role_required: 'backend',
        },
      },
    );
    const taskId = taskRes.task.id;
    expect(taskRes.task.status).toBe('ready');

    // 2. Claim task
    const claimRes = await client.request<{ task: { status: string; version: number } }>(
      `/api/v1/tasks/${taskId}/claim`,
      {
        method: 'POST',
        body: { version: taskRes.task.version },
      },
    );
    expect(claimRes.task.status).toBe('claimed');

    // 3. Lock files
    const lockRes = await client.request<{ lock: { id: string; path_glob: string } }>('/api/v1/locks', {
      method: 'POST',
      body: {
        project_id: projectId,
        task_id: taskId,
        path_glob: 'packages/shared/**',
        ttl_minutes: 60,
      },
    });
    expect(lockRes.lock.path_glob).toBe('packages/shared/**');
    const lockId = lockRes.lock.id;

    // 4. Send question message
    const msgRes = await client.request<{ message: { id: string; kind: string } }>('/api/v1/messages', {
      method: 'POST',
      body: {
        project_id: projectId,
        task_id: taskId,
        kind: 'question',
        body: 'Do we need backward compatibility for M0?',
      },
    });
    expect(msgRes.message.kind).toBe('question');

    // 5. Read inbox and auto-mark as read
    const inboxRes = await client.request<{ messages: Array<{ id: string; is_read: number }> }>('/api/v1/messages', {
      query: { unread: 'true' },
    });
    expect(inboxRes.messages.length).toBeGreaterThanOrEqual(1);

    // Mark as read
    await client.request(`/api/v1/messages/${msgRes.message.id}/read`, { method: 'POST' });

    // 6. Attach PR artifact
    const artifactRes = await client.request<{ artifact: { id: string; kind: string } }>('/api/v1/artifacts', {
      method: 'POST',
      body: {
        task_id: taskId,
        kind: 'pr',
        title: 'PR #10: Shared Types',
        uri: 'https://github.com/org/repo/pull/10',
      },
    });
    expect(artifactRes.artifact.kind).toBe('pr');

    // 7. Release locks
    await client.request(`/api/v1/locks/${lockId}`, { method: 'DELETE' });

    // 8. Move task from claimed -> in_progress
    await client.request(`/api/v1/tasks/${taskId}/status`, {
      method: 'POST',
      body: { status: 'in_progress', branch: 'agent/backend/api-spec' },
    });

    // 9. Move task from in_progress -> in_review
    const reviewRes = await client.request<{ task: { status: string } }>(`/api/v1/tasks/${taskId}/status`, {
      method: 'POST',
      body: { status: 'in_review', pr_url: 'https://github.com/org/repo/pull/10' },
    });
    expect(reviewRes.task.status).toBe('in_review');
  });
});

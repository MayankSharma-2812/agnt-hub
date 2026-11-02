import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

describe('Audit Events Log & SSE Resumption', () => {
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
      payload: { name: 'Events Test Project' },
    });
    projectId = JSON.parse(projRes.body).project.id;
  });

  it('records audit events for state mutating operations', async () => {
    // Create task
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Audit Task' },
    });
    const task = JSON.parse(taskRes.body).task;

    // Claim task
    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-agent-name': 'audit-agent' },
      payload: { version: task.version },
    });

    // Query events log
    const eventsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/events',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(eventsRes.statusCode).toBe(200);
    const events = JSON.parse(eventsRes.body).events;

    const eventTypes = events.map((e: { type: string }) => e.type);
    expect(eventTypes).toContain('member.created');
    expect(eventTypes).toContain('project.created');
    expect(eventTypes).toContain('task.created');
    expect(eventTypes).toContain('task.claimed');
  });

  it('replays missed events when connecting to SSE stream with Last-Event-ID', async () => {
    // Generate several events
    await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Event 1' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { project_id: projectId, title: 'Event 2' },
    });

    // Get current events to find an intermediate ID
    const eventsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/events',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const events = JSON.parse(eventsRes.body).events;
    expect(events.length).toBeGreaterThanOrEqual(3);

    const resumeFromId = events[events.length - 2].id;

    // Connect to SSE with Last-Event-ID
    const sseRes = await app.inject({
      method: 'GET',
      url: '/api/v1/events/stream',
      query: { close_after_replay: 'true' },
      headers: {
        authorization: `Bearer ${adminToken}`,
        'last-event-id': String(resumeFromId),
      },
    });

    expect(sseRes.statusCode).toBe(200);
    expect(sseRes.headers['content-type']).toBe('text/event-stream');
    // The SSE output should contain the resumed event
    expect(sseRes.body).toContain(`id: ${events[events.length - 1].id}`);
    expect(sseRes.body).not.toContain(`id: ${events[0].id}`);
  });
});

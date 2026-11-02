import { FastifyInstance } from 'fastify';
import { requireAuth } from '../services/auth.js';
import { handleSseConnection } from '../services/events.js';
import { Event } from '@agent-hub/shared';

export async function eventRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/events
  fastify.get('/api/v1/events', { preHandler: [requireAuth] }, async (req) => {
    const query = req.query as { since?: string; limit?: string };
    const sinceId = query.since ? parseInt(query.since, 10) : 0;
    const limit = query.limit ? parseInt(query.limit, 10) : 100;

    const events = req.db
      .prepare('SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?')
      .all(isNaN(sinceId) ? 0 : sinceId, limit) as Event[];

    return { events };
  });

  // GET /api/v1/events/stream
  fastify.get('/api/v1/events/stream', async (req, reply) => {
    // Optional bearer token check via query parameter (?token=...) or standard header
    const tokenParam = (req.query as { token?: string })?.token;
    if (tokenParam && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${tokenParam}`;
    }

    await requireAuth(req, reply);
    if (reply.sent) return;

    handleSseConnection(req, reply, req.db);
  });
}

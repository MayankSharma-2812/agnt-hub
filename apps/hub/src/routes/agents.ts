import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';
import { emitEvent } from '../services/events.js';
import { Agent, AGENT_STATUSES } from '@agent-hub/shared';

const HeartbeatSchema = z.object({
  status: z.enum(AGENT_STATUSES),
  current_task_id: z.string().optional().nullable(),
});

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/agents
  fastify.get('/api/v1/agents', { preHandler: [requireAuth] }, async (req) => {
    const agents = req.db.prepare('SELECT * FROM agents ORDER BY name ASC').all() as Agent[];
    return { agents };
  });

  // POST /api/v1/agents/heartbeat
  fastify.post('/api/v1/agents/heartbeat', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = HeartbeatSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid heartbeat payload', details: parse.error.issues },
      });
    }

    const agent = req.agent;
    if (!agent) {
      return reply.status(400).send({
        error: { code: 'AGENT_REQUIRED', message: 'Heartbeat requires X-Agent-Name header' },
      });
    }

    const { status, current_task_id } = parse.data;

    req.db
      .prepare(
        `
      UPDATE agents
      SET status = ?,
          current_task_id = ?,
          last_seen_at = datetime('now')
      WHERE id = ?
    `,
      )
      .run(status, current_task_id ?? null, agent.id);

    emitEvent(req.db, 'agent.heartbeat', { agentId: agent.id, status, current_task_id }, {
      actorAgentId: agent.id,
      actorMemberId: req.member!.id,
    });

    const updated = req.db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as Agent;
    return { agent: updated };
  });
}

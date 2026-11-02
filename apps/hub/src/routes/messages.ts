import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';
import { generateUlid } from '../services/ulid.js';
import { emitEvent } from '../services/events.js';
import { Message, MESSAGE_KINDS } from '@agent-hub/shared';

const SendMessageSchema = z.object({
  project_id: z.string().min(1),
  task_id: z.string().optional().nullable(),
  to_agent_id: z.string().optional().nullable(),
  kind: z.enum(MESSAGE_KINDS),
  body: z.string().min(1),
  reply_to_id: z.string().optional().nullable(),
});

export async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/messages
  fastify.get('/api/v1/messages', { preHandler: [requireAuth] }, async (req) => {
    const query = req.query as {
      task?: string;
      kind?: string;
      unread?: string;
      to_agent_id?: string;
    };

    let sql = `
      SELECT m.*,
        CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
      FROM messages m
      LEFT JOIN message_reads r ON m.id = r.message_id AND r.agent_id = ?
      WHERE 1=1
    `;
    const params: unknown[] = [req.agent?.id ?? null];

    if (query.task) {
      sql += ' AND m.task_id = ?';
      params.push(query.task);
    }
    if (query.kind) {
      sql += ' AND m.kind = ?';
      params.push(query.kind);
    }
    if (query.to_agent_id) {
      sql += ' AND (m.to_agent_id = ? OR m.to_agent_id IS NULL)';
      params.push(query.to_agent_id);
    }
    if (query.unread === 'true') {
      sql += ' AND r.read_at IS NULL';
    }

    sql += ' ORDER BY m.created_at ASC';
    const messages = req.db.prepare(sql).all(...params);
    return { messages };
  });

  // POST /api/v1/messages
  fastify.post('/api/v1/messages', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = SendMessageSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid message payload', details: parse.error.issues },
      });
    }

    const { project_id, task_id, to_agent_id, kind, body, reply_to_id } = parse.data;
    const messageId = generateUlid();

    req.db
      .prepare(
        `
      INSERT INTO messages (id, project_id, task_id, from_agent_id, from_member_id, to_agent_id, kind, body, reply_to_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        messageId,
        project_id,
        task_id ?? null,
        req.agent?.id ?? null,
        req.member!.id,
        to_agent_id ?? null,
        kind,
        body,
        reply_to_id ?? null,
      );

    emitEvent(
      req.db,
      'message.created',
      { messageId, kind, taskId: task_id, toAgentId: to_agent_id },
      {
        projectId: project_id,
        actorAgentId: req.agent?.id ?? null,
        actorMemberId: req.member!.id,
      },
    );

    const message = req.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as Message;
    return reply.status(201).send({ message });
  });

  // POST /api/v1/messages/:id/read
  fastify.post('/api/v1/messages/:id/read', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const agentId = req.agent?.id;
    if (!agentId) {
      return reply.status(400).send({
        error: { code: 'AGENT_REQUIRED', message: 'Marking read requires an active agent context' },
      });
    }

    try {
      req.db
        .prepare('INSERT OR IGNORE INTO message_reads (message_id, agent_id) VALUES (?, ?)')
        .run(id, agentId);
    } catch {
      // Ignore
    }

    return { success: true, message_id: id };
  });
}

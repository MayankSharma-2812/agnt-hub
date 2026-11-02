import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';
import { acquireLock } from '../services/locks.js';
import { emitEvent } from '../services/events.js';
import { FileLock } from '@agent-hub/shared';

const AcquireLockSchema = z.object({
  project_id: z.string().min(1),
  task_id: z.string().optional().nullable(),
  path_glob: z.string().min(1),
  ttl_minutes: z.number().int().positive().optional().default(120),
});

export async function lockRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/locks
  fastify.get('/api/v1/locks', { preHandler: [requireAuth] }, async (req) => {
    const query = req.query as { project_id?: string };
    let sql = `
      SELECT l.*, a.name as agent_name, m.name as member_name
      FROM file_locks l
      JOIN agents a ON l.agent_id = a.id
      JOIN members m ON a.member_id = m.id
      WHERE l.released_at IS NULL AND datetime(l.expires_at) > datetime('now')
    `;
    const params: unknown[] = [];

    if (query.project_id) {
      sql += ' AND l.project_id = ?';
      params.push(query.project_id);
    }

    sql += ' ORDER BY l.created_at DESC';
    const locks = req.db.prepare(sql).all(...params);
    return { locks };
  });

  // POST /api/v1/locks
  fastify.post('/api/v1/locks', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = AcquireLockSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid lock payload', details: parse.error.issues },
      });
    }

    const agentId = req.agent?.id;
    if (!agentId) {
      return reply.status(400).send({
        error: { code: 'AGENT_REQUIRED', message: 'Acquiring a lock requires an active agent context' },
      });
    }

    const { project_id, task_id, path_glob, ttl_minutes } = parse.data;

    try {
      const result = acquireLock(req.db, {
        projectId: project_id,
        agentId,
        taskId: task_id ?? null,
        pathGlob: path_glob,
        ttlMinutes: ttl_minutes,
      });

      if (!result.success) {
        return reply.status(409).send({
          error: {
            code: 'LOCK_CONFLICT',
            message: `Path '${path_glob}' overlaps an active lock held by another agent`,
            conflict: result.conflict,
          },
        });
      }

      emitEvent(
        req.db,
        'lock.acquired',
        { lockId: result.lock.id, pathGlob: path_glob, taskId: task_id },
        {
          projectId: project_id,
          actorAgentId: agentId,
          actorMemberId: req.member!.id,
        },
      );

      return reply.status(201).send({ lock: result.lock });
    } catch (err: unknown) {
      return reply.status(400).send({
        error: { code: 'LOCK_ERROR', message: (err as Error).message },
      });
    }
  });

  // DELETE /api/v1/locks/:id
  fastify.delete('/api/v1/locks/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const lock = req.db.prepare('SELECT * FROM file_locks WHERE id = ?').get(id) as FileLock | undefined;

    if (!lock) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Lock ${id} not found` } });
    }

    // Check ownership or admin
    const isOwner = req.agent?.id === lock.agent_id;
    const isAdmin = req.member?.is_admin === 1;

    if (!isOwner && !isAdmin) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the lock holder or an administrator can release this lock' },
      });
    }

    req.db.prepare("UPDATE file_locks SET released_at = datetime('now') WHERE id = ?").run(id);

    emitEvent(req.db, 'lock.released', { lockId: id, pathGlob: lock.path_glob }, {
      projectId: lock.project_id,
      actorAgentId: req.agent?.id ?? null,
      actorMemberId: req.member!.id,
    });

    return { success: true, released_id: id };
  });
}

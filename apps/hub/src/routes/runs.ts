import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';
import { generateUlid } from '../services/ulid.js';
import { emitEvent } from '../services/events.js';
import { Run, RUN_STATUSES } from '@agent-hub/shared';

const StartRunSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(RUN_STATUSES).default('running'),
  model: z.string().optional().nullable(),
  log_path: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

const FinishRunSchema = z.object({
  status: z.enum(RUN_STATUSES),
  exit_code: z.number().int().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function runRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/runs
  fastify.post('/api/v1/runs', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = StartRunSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid run payload', details: parse.error.issues },
      });
    }

    const agentId = req.agent?.id;
    if (!agentId) {
      return reply.status(400).send({
        error: { code: 'AGENT_REQUIRED', message: 'Starting a run requires an active agent context' },
      });
    }

    const { task_id, status, model, log_path, note } = parse.data;
    const task = req.db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(task_id) as
      | { project_id: string }
      | undefined;

    if (!task) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Task ${task_id} not found` } });
    }

    const runId = generateUlid();

    req.db
      .prepare(
        `
      INSERT INTO runs (id, task_id, agent_id, status, model, log_path, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(runId, task_id, agentId, status, model ?? null, log_path ?? null, note ?? null);

    emitEvent(req.db, 'run.started', { runId, taskId: task_id, status }, {
      projectId: task.project_id,
      actorAgentId: agentId,
      actorMemberId: req.member!.id,
    });

    const run = req.db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as Run;
    return reply.status(201).send({ run });
  });

  // PATCH /api/v1/runs/:id
  fastify.patch('/api/v1/runs/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = FinishRunSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid run update payload', details: parse.error.issues },
      });
    }

    const current = req.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Run | undefined;
    if (!current) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Run ${id} not found` } });
    }

    const { status, exit_code, note } = parse.data;

    req.db
      .prepare(
        `
      UPDATE runs
      SET status = ?,
          exit_code = COALESCE(?, exit_code),
          ended_at = datetime('now'),
          note = COALESCE(?, note)
      WHERE id = ?
    `,
      )
      .run(status, exit_code ?? null, note ?? null, id);

    emitEvent(req.db, 'run.finished', { runId: id, status, exitCode: exit_code }, {
      actorAgentId: current.agent_id,
      actorMemberId: req.member!.id,
    });

    const updated = req.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Run;
    return { run: updated };
  });
}

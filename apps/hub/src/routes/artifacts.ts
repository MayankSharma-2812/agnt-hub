import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';
import { generateUlid } from '../services/ulid.js';
import { emitEvent } from '../services/events.js';
import { Artifact, ARTIFACT_KINDS } from '@agent-hub/shared';

const CreateArtifactSchema = z.object({
  task_id: z.string().min(1),
  kind: z.enum(ARTIFACT_KINDS),
  title: z.string().min(1),
  uri: z.string().min(1),
  summary: z.string().optional().nullable(),
});

export async function artifactRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/artifacts
  fastify.post('/api/v1/artifacts', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CreateArtifactSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid artifact payload', details: parse.error.issues },
      });
    }

    const { task_id, kind, title, uri, summary } = parse.data;

    const task = req.db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(task_id) as
      | { project_id: string }
      | undefined;

    if (!task) {
      return reply.status(404).send({
        error: { code: 'TASK_NOT_FOUND', message: `Task ${task_id} not found` },
      });
    }

    const artifactId = generateUlid();

    req.db
      .prepare(
        `
      INSERT INTO artifacts (id, task_id, agent_id, kind, title, uri, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(artifactId, task_id, req.agent?.id ?? null, kind, title, uri, summary ?? null);

    emitEvent(
      req.db,
      'artifact.created',
      { artifactId, taskId: task_id, kind, title, uri },
      {
        projectId: task.project_id,
        actorAgentId: req.agent?.id ?? null,
        actorMemberId: req.member!.id,
      },
    );

    const artifact = req.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId) as Artifact;
    return reply.status(201).send({ artifact });
  });
}

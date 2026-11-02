import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';
import { generateUlid } from '../services/ulid.js';
import { emitEvent } from '../services/events.js';
import { Project } from '@agent-hub/shared';

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  repo_url: z.string().optional(),
  default_branch: z.string().default('main'),
});

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/projects
  fastify.get('/api/v1/projects', { preHandler: [requireAuth] }, async (req) => {
    const projects = req.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[];
    return { projects };
  });

  // POST /api/v1/projects
  fastify.post('/api/v1/projects', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CreateProjectSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid project payload', details: parse.error.issues },
      });
    }

    const { name, repo_url, default_branch } = parse.data;
    const projectId = generateUlid();

    req.db
      .prepare('INSERT INTO projects (id, name, repo_url, default_branch) VALUES (?, ?, ?, ?)')
      .run(projectId, name, repo_url ?? null, default_branch);

    emitEvent(req.db, 'project.created', { projectId, name }, {
      projectId,
      actorMemberId: req.member!.id,
    });

    const project = req.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project;
    return reply.status(201).send({ project });
  });
}

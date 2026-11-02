import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';
import { generateUlid } from '../services/ulid.js';
import { emitEvent } from '../services/events.js';
import {
  canTransition,
  getAllowedNextStates,
  claimTask,
  updateDependentTasks,
} from '../services/tasks.js';
import { Task, TaskStatus, AGENT_ROLES, TASK_STATUSES } from '@agent-hub/shared';

const CreateTaskSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  acceptance_criteria: z.string().default(''),
  role_required: z.enum(AGENT_ROLES).optional().nullable(),
  priority: z.number().int().min(1).max(3).default(2),
  depends_on: z.array(z.string()).optional(),
});

const PatchTaskSchema = z.object({
  version: z.number().int(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  acceptance_criteria: z.string().optional(),
  role_required: z.enum(AGENT_ROLES).optional().nullable(),
  priority: z.number().int().min(1).max(3).optional(),
  branch: z.string().optional().nullable(),
  pr_url: z.string().optional().nullable(),
});

const StatusTransitionSchema = z.object({
  status: z.enum(TASK_STATUSES),
  note: z.string().optional(),
  branch: z.string().optional(),
  pr_url: z.string().optional(),
});

const ManageDepsSchema = z.object({
  action: z.enum(['add', 'remove']),
  depends_on_task_id: z.string().min(1),
});

export async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/tasks
  fastify.get('/api/v1/tasks', { preHandler: [requireAuth] }, async (req) => {
    const query = req.query as {
      status?: string;
      role?: string;
      assignee?: string;
      project?: string;
    };

    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: unknown[] = [];

    if (query.project) {
      sql += ' AND project_id = ?';
      params.push(query.project);
    }
    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    if (query.role) {
      sql += ' AND role_required = ?';
      params.push(query.role);
    }
    if (query.assignee) {
      sql += ' AND assignee_agent_id = ?';
      params.push(query.assignee);
    }

    sql += ' ORDER BY priority ASC, created_at ASC';
    const tasks = req.db.prepare(sql).all(...params) as Task[];
    return { tasks };
  });

  // POST /api/v1/tasks
  fastify.post('/api/v1/tasks', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CreateTaskSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid task payload', details: parse.error.issues },
      });
    }

    const { project_id, title, description, acceptance_criteria, role_required, priority, depends_on } = parse.data;
    const taskId = generateUlid();

    // Determine initial status: if has dependencies, backlog; else ready
    const hasDeps = depends_on && depends_on.length > 0;
    const initialStatus: TaskStatus = hasDeps ? 'backlog' : 'ready';

    req.db.transaction(() => {
      req.db
        .prepare(
          `
        INSERT INTO tasks (
          id, project_id, title, description, acceptance_criteria, role_required, priority, status, created_by_member_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          taskId,
          project_id,
          title,
          description,
          acceptance_criteria,
          role_required ?? null,
          priority,
          initialStatus,
          req.member!.id,
        );

      if (hasDeps) {
        const insertDep = req.db.prepare(
          'INSERT INTO task_deps (task_id, depends_on_task_id) VALUES (?, ?)',
        );
        for (const depId of depends_on!) {
          insertDep.run(taskId, depId);
        }
      }

      emitEvent(
        req.db,
        'task.created',
        { taskId, title, status: initialStatus, depends_on: depends_on ?? [] },
        {
          projectId: project_id,
          actorMemberId: req.member!.id,
          actorAgentId: req.agent?.id ?? null,
        },
      );
    })();

    const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
    return reply.status(201).send({ task });
  });

  // GET /api/v1/tasks/:id
  fastify.get('/api/v1/tasks/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Task ${id} not found` },
      });
    }

    const dependencies = req.db
      .prepare(
        `
      SELECT t.* FROM tasks t
      JOIN task_deps d ON t.id = d.depends_on_task_id
      WHERE d.task_id = ?
    `,
      )
      .all(id) as Task[];

    const messages = req.db
      .prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC')
      .all(id);

    const artifacts = req.db
      .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC')
      .all(id);

    const runs = req.db
      .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY started_at ASC')
      .all(id);

    return {
      task,
      dependencies,
      messages,
      artifacts,
      runs,
    };
  });

  // PATCH /api/v1/tasks/:id
  fastify.patch('/api/v1/tasks/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = PatchTaskSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid patch payload', details: parse.error.issues },
      });
    }

    const current = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!current) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Task ${id} not found` } });
    }

    const { version, ...fields } = parse.data;
    if (current.version !== version) {
      return reply.status(409).send({
        error: {
          code: 'VERSION_CONFLICT',
          message: `Version conflict: provided ${version}, current is ${current.version}`,
          current_version: current.version,
        },
      });
    }

    const updates: string[] = ['version = version + 1', "updated_at = datetime('now')"];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }

    params.push(id, version);
    const result = req.db
      .prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND version = ?`)
      .run(...params);

    if (result.changes === 0) {
      return reply.status(409).send({
        error: { code: 'CONCURRENCY_ERROR', message: 'Task was updated concurrently' },
      });
    }

    emitEvent(req.db, 'task.updated', { taskId: id, updates: fields }, {
      projectId: current.project_id,
      actorMemberId: req.member!.id,
      actorAgentId: req.agent?.id ?? null,
    });

    const updated = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    return { task: updated };
  });

  // POST /api/v1/tasks/:id/claim
  fastify.post('/api/v1/tasks/:id/claim', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { version?: number }) || {};

    const agentId = req.agent?.id;
    if (!agentId) {
      return reply.status(400).send({
        error: {
          code: 'AGENT_REQUIRED',
          message: 'Claiming a task requires an active agent context (pass X-Agent-Name header)',
        },
      });
    }

    const result = claimTask(req.db, id, agentId, body.version);
    if (!result.success) {
      return reply.status(409).send({
        error: {
          code: result.code,
          message: result.message,
          current_task: result.current,
        },
      });
    }

    emitEvent(req.db, 'task.claimed', { taskId: id, agentId }, {
      projectId: result.task.project_id,
      actorAgentId: agentId,
      actorMemberId: req.member!.id,
    });

    return { task: result.task };
  });

  // POST /api/v1/tasks/:id/status
  fastify.post('/api/v1/tasks/:id/status', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = StatusTransitionSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid status payload', details: parse.error.issues },
      });
    }

    const current = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!current) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Task ${id} not found` } });
    }

    const targetStatus = parse.data.status;
    if (!canTransition(current.status, targetStatus)) {
      const allowed = getAllowedNextStates(current.status);
      return reply.status(409).send({
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot transition task from '${current.status}' to '${targetStatus}'`,
          allowed,
        },
      });
    }

    // Additional checks per status
    let completedAt: string | null = current.completed_at ?? null;
    if (targetStatus === 'done') {
      completedAt = new Date().toISOString();
    }

    req.db.transaction(() => {
      req.db
        .prepare(
          `
        UPDATE tasks
        SET status = ?,
            branch = COALESCE(?, branch),
            pr_url = COALESCE(?, pr_url),
            completed_at = ?,
            updated_at = datetime('now'),
            version = version + 1
        WHERE id = ?
      `,
        )
        .run(targetStatus, parse.data.branch ?? null, parse.data.pr_url ?? null, completedAt, id);

      emitEvent(
        req.db,
        'task.status_changed',
        {
          taskId: id,
          from: current.status,
          to: targetStatus,
          note: parse.data.note,
        },
        {
          projectId: current.project_id,
          actorMemberId: req.member!.id,
          actorAgentId: req.agent?.id ?? null,
        },
      );

      // If task moved to 'done', evaluate dependent backlog tasks
      if (targetStatus === 'done') {
        const unblocked = updateDependentTasks(req.db, id);
        for (const unblockedId of unblocked) {
          emitEvent(
            req.db,
            'task.unblocked',
            { taskId: unblockedId, causeTaskId: id },
            { projectId: current.project_id },
          );
        }
      }
    })();

    const updated = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    return { task: updated };
  });

  // POST /api/v1/tasks/:id/deps
  fastify.post('/api/v1/tasks/:id/deps', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = ManageDepsSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid dependency payload', details: parse.error.issues },
      });
    }

    const { action, depends_on_task_id } = parse.data;
    if (id === depends_on_task_id) {
      return reply.status(400).send({
        error: { code: 'INVALID_DEP', message: 'A task cannot depend on itself' },
      });
    }

    if (action === 'add') {
      try {
        req.db
          .prepare('INSERT INTO task_deps (task_id, depends_on_task_id) VALUES (?, ?)')
          .run(id, depends_on_task_id);
      } catch {
        // Already exists or invalid foreign key
      }
    } else {
      req.db
        .prepare('DELETE FROM task_deps WHERE task_id = ? AND depends_on_task_id = ?')
        .run(id, depends_on_task_id);
    }

    const dependencies = req.db
      .prepare('SELECT depends_on_task_id FROM task_deps WHERE task_id = ?')
      .all(id);

    return { task_id: id, dependencies };
  });
}

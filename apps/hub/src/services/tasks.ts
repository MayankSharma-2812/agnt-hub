import Database from 'better-sqlite3';
import { Task, TaskStatus } from '@agent-hub/shared';

export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['ready', 'cancelled'],
  ready: ['claimed', 'cancelled'],
  claimed: ['in_progress', 'ready', 'cancelled'],
  in_progress: ['blocked', 'in_review', 'ready', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  in_review: ['done', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

export function canTransition(currentStatus: TaskStatus, targetStatus: TaskStatus): boolean {
  if (targetStatus === 'cancelled') return true;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export function getAllowedNextStates(currentStatus: TaskStatus): TaskStatus[] {
  return ALLOWED_TRANSITIONS[currentStatus] || [];
}

export function updateDependentTasks(db: Database.Database, finishedTaskId: string): string[] {
  // Find all backlog tasks that depend on finishedTaskId
  const dependentTasks = db
    .prepare(
      `
    SELECT t.id
    FROM tasks t
    JOIN task_deps d ON t.id = d.task_id
    WHERE d.depends_on_task_id = ? AND t.status = 'backlog'
  `,
    )
    .all(finishedTaskId) as { id: string }[];

  const unblockedTaskIds: string[] = [];

  for (const dep of dependentTasks) {
    // Check if ALL dependencies of this task are 'done'
    const remainingDeps = db
      .prepare(
        `
      SELECT COUNT(*) as remaining
      FROM task_deps d
      JOIN tasks dt ON d.depends_on_task_id = dt.id
      WHERE d.task_id = ? AND dt.status != 'done'
    `,
      )
      .get(dep.id) as { remaining: number };

    if (remainingDeps.remaining === 0) {
      db.prepare(
        `
        UPDATE tasks SET status = 'ready', updated_at = datetime('now'), version = version + 1
        WHERE id = ?
      `,
      ).run(dep.id);
      unblockedTaskIds.push(dep.id);
    }
  }

  return unblockedTaskIds;
}

export function claimTask(
  db: Database.Database,
  taskId: string,
  agentId: string,
  expectedVersion?: number,
): { success: true; task: Task } | { success: false; code: string; message: string; current?: Task } {
  const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
  if (!current) {
    return { success: false, code: 'NOT_FOUND', message: 'Task not found' };
  }

  if (current.status !== 'ready') {
    return {
      success: false,
      code: 'TASK_NOT_READY',
      message: `Task is currently in '${current.status}' status, cannot claim`,
      current,
    };
  }

  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    return {
      success: false,
      code: 'VERSION_CONFLICT',
      message: `Version conflict: provided version ${expectedVersion} does not match current version ${current.version}`,
      current,
    };
  }

  // Atomic claim
  const info = db
    .prepare(
      `
    UPDATE tasks
    SET status = 'claimed',
        assignee_agent_id = ?,
        claimed_at = datetime('now'),
        updated_at = datetime('now'),
        version = version + 1
    WHERE id = ? AND version = ? AND status = 'ready'
  `,
    )
    .run(agentId, taskId, current.version);

  if (info.changes === 0) {
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
    return {
      success: false,
      code: 'CLAIM_RACE_LOST',
      message: 'Task was claimed or modified by another agent concurrently',
      current: updated,
    };
  }

  const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
  return { success: true, task: updatedTask };
}

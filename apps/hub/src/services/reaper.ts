import Database from 'better-sqlite3';
import { emitEvent } from './events.js';

export function runReaper(db: Database.Database): { expiredLocks: number; revertedTasks: number } {
  // 1. Expire locks
  const lockInfo = db
    .prepare(
      `
    UPDATE file_locks
    SET released_at = datetime('now')
    WHERE released_at IS NULL AND datetime(expires_at) <= datetime('now')
  `,
    )
    .run();

  // 2. Revert abandoned claimed/in_progress tasks (>30m no heartbeat)
  const staleTasks = db
    .prepare(
      `
    SELECT t.id, t.project_id, t.assignee_agent_id, t.status
    FROM tasks t
    LEFT JOIN agents a ON t.assignee_agent_id = a.id
    WHERE t.status IN ('claimed', 'in_progress')
      AND (a.last_seen_at IS NULL OR datetime(a.last_seen_at) <= datetime('now', '-30 minutes'))
  `,
    )
    .all() as { id: string; project_id: string; assignee_agent_id: string | null; status: string }[];

  let revertedTasks = 0;
  for (const st of staleTasks) {
    db.prepare(
      `
      UPDATE tasks
      SET status = 'ready',
          assignee_agent_id = NULL,
          version = version + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `,
    ).run(st.id);

    emitEvent(
      db,
      'task.reaped',
      {
        taskId: st.id,
        previousStatus: st.status,
        reason: 'agent_heartbeat_timeout_30m',
      },
      {
        projectId: st.project_id,
        actorAgentId: st.assignee_agent_id,
      },
    );

    revertedTasks++;
  }

  return {
    expiredLocks: lockInfo.changes,
    revertedTasks,
  };
}

export function startReaperJob(db: Database.Database, intervalMs: number = 60000): NodeJS.Timeout {
  return setInterval(() => {
    try {
      runReaper(db);
    } catch (err) {
      console.error('Error in reaper job:', err);
    }
  }, intervalMs);
}

import Database from 'better-sqlite3';
import picomatch from 'picomatch';
import { generateUlid } from './ulid.js';
import { FileLock } from '@agent-hub/shared';

export function globsOverlap(pattern1: string, pattern2: string): boolean {
  if (pattern1 === pattern2) return true;

  const p1 = pattern1.replace(/^\.?\//, '');
  const p2 = pattern2.replace(/^\.?\//, '');
  if (p1 === p2) return true;

  const isMatch1 = picomatch(p1, { dot: true });
  const isMatch2 = picomatch(p2, { dot: true });

  if (isMatch1(p2) || isMatch2(p1)) return true;

  // Base directory overlap
  const base1 = p1.replace(/(\/\*\*|\/\*|\*).*$/, '');
  const base2 = p2.replace(/(\/\*\*|\/\*|\*).*$/, '');

  if (base1 === base2 && (p1.includes('*') || p2.includes('*'))) return true;
  if (base1.length > 0 && base2.startsWith(base1 + '/')) return true;
  if (base2.length > 0 && base1.startsWith(base2 + '/')) return true;

  return false;
}

export function acquireLock(
  db: Database.Database,
  params: {
    projectId: string;
    agentId: string;
    taskId?: string | null;
    pathGlob: string;
    ttlMinutes?: number;
  },
): { success: true; lock: FileLock } | { success: false; conflict: FileLock } {
  const ttl = params.ttlMinutes ?? 120;
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  // Query all currently active locks for the project
  const activeLocks = db
    .prepare(
      `
    SELECT * FROM file_locks
    WHERE project_id = ? AND released_at IS NULL AND datetime(expires_at) > datetime('now')
  `,
    )
    .all(params.projectId) as FileLock[];

  // Check agent active lock count cap (<= 10)
  const agentActiveCount = activeLocks.filter((l) => l.agent_id === params.agentId).length;
  if (agentActiveCount >= 10) {
    throw new Error('LIMIT_EXCEEDED: Maximum 10 active locks allowed per agent');
  }

  // Check overlap against other agents' active locks
  for (const existing of activeLocks) {
    if (existing.agent_id !== params.agentId) {
      if (globsOverlap(params.pathGlob, existing.path_glob)) {
        return { success: false, conflict: existing };
      }
    } else if (existing.path_glob === params.pathGlob) {
      // Renew existing lock held by same agent
      db.prepare(
        `
        UPDATE file_locks SET expires_at = ?, task_id = COALESCE(?, task_id)
        WHERE id = ?
      `,
      ).run(expiresAt, params.taskId ?? null, existing.id);

      const renewed = db.prepare('SELECT * FROM file_locks WHERE id = ?').get(existing.id) as FileLock;
      return { success: true, lock: renewed };
    }
  }

  // Insert new lock
  const lockId = generateUlid();
  db.prepare(
    `
    INSERT INTO file_locks (id, project_id, agent_id, task_id, path_glob, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(lockId, params.projectId, params.agentId, params.taskId ?? null, params.pathGlob, expiresAt);

  const lock = db.prepare('SELECT * FROM file_locks WHERE id = ?').get(lockId) as FileLock;
  return { success: true, lock };
}

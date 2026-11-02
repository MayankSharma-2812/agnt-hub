import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { initDatabase } from '../db/database.js';

describe('SQLite Hot Backup & Restore Operations', () => {
  let tmpDir: string;
  let sourceDbPath: string;
  let backupDbPath: string;
  let restoredDbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-backup-test-'));
    sourceDbPath = path.join(tmpDir, 'source.db');
    backupDbPath = path.join(tmpDir, 'backups', 'backup.db');
    restoredDbPath = path.join(tmpDir, 'restored.db');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('performs online hot backup with sqlite3 .backup and verifies checksum and integrity', () => {
    // 1. Initialize source database and seed data
    const { db } = initDatabase(sourceDbPath);
    db.prepare("INSERT INTO projects (id, name) VALUES ('p-backup-1', 'Backup Test Project')").run();
    db.prepare("INSERT INTO tasks (id, project_id, title, status) VALUES ('t-1', 'p-backup-1', 'Task 1', 'ready')").run();
    db.prepare("INSERT INTO tasks (id, project_id, title, status) VALUES ('t-2', 'p-backup-1', 'Task 2', 'in_progress')").run();
    db.close();

    const rootDir = path.resolve(import.meta.dirname, '../../../../');
    const backupScript = path.join(rootDir, 'scripts/backup.sh');
    const restoreScript = path.join(rootDir, 'scripts/restore.sh');

    // 2. Run backup.sh
    const backupOutput = execFileSync(backupScript, [sourceDbPath, backupDbPath], {
      encoding: 'utf8',
    });
    expect(backupOutput).toContain('Backup verified (integrity: ok)');
    expect(fs.existsSync(backupDbPath)).toBe(true);
    expect(fs.existsSync(`${backupDbPath}.sha256`)).toBe(true);

    // 3. Run restore.sh into a fresh database path
    const restoreOutput = execFileSync(restoreScript, [backupDbPath, restoredDbPath], {
      encoding: 'utf8',
    });
    expect(restoreOutput).toContain('Restore verified successfully');
    expect(fs.existsSync(restoredDbPath)).toBe(true);

    // 4. Connect to restored database and verify data integrity
    const restoredDb = new Database(restoredDbPath);
    const integrity = restoredDb.pragma('integrity_check') as [{ integrity_check: string }];
    expect(integrity[0].integrity_check).toBe('ok');

    const project = restoredDb.prepare('SELECT * FROM projects WHERE id = ?').get('p-backup-1') as { name: string };
    expect(project).toBeDefined();
    expect(project.name).toBe('Backup Test Project');

    const tasks = restoredDb.prepare('SELECT id, status FROM tasks ORDER BY id ASC').all() as Array<{ id: string; status: string }>;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('t-1');
    expect(tasks[1].status).toBe('in_progress');

    restoredDb.close();
  });
});

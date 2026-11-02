import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { FastifyInstance } from 'fastify';
import { initDatabase } from '../../../../apps/hub/src/db/database.js';
import { buildApp } from '../../../../apps/hub/src/app.js';
import { HubDaemon } from '../daemon.js';
import { HubdConfig } from '../config.js';

describe('HubDaemon End-to-End Orchestration', () => {
  let app: FastifyInstance;
  let hubUrl: string;
  let adminToken: string;
  let tmpBaseDir: string;
  let bareRepoPath: string;
  let workRepoPath: string;
  let fakeAgyPath: string;

  beforeAll(async () => {
    // 1. Initialize Hub
    const { db, adminToken: token } = initDatabase(':memory:');
    adminToken = token!;
    app = buildApp(db);

    // Seed project
    db.prepare("INSERT INTO projects (id, name) VALUES ('proj-m4', 'Daemon Test Project')").run();

    const address = await app.listen({ port: 3960, host: '127.0.0.1' });
    hubUrl = address;

    // 2. Set up local git bare remote and working clone
    tmpBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubd-e2e-test-'));
    bareRepoPath = path.join(tmpBaseDir, 'remote-origin.git');
    workRepoPath = path.join(tmpBaseDir, 'work-repo');

    // Create bare repo
    execFileSync('git', ['init', '--bare', bareRepoPath]);

    // Create working repo
    execFileSync('git', ['init', '-b', 'main', workRepoPath]);
    execFileSync('git', ['config', 'user.name', 'Daemon Tester'], { cwd: workRepoPath });
    execFileSync('git', ['config', 'user.email', 'daemon@example.com'], { cwd: workRepoPath });
    execFileSync('git', ['remote', 'add', 'origin', bareRepoPath], { cwd: workRepoPath });

    const readme = path.join(workRepoPath, 'README.md');
    fs.writeFileSync(readme, '# Workspace\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: workRepoPath });
    execFileSync('git', ['commit', '-m', 'chore: initial workspace commit'], { cwd: workRepoPath });
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: workRepoPath });

    fakeAgyPath = path.resolve(import.meta.dirname, 'fixtures/fake-agy.js');
  });

  afterAll(async () => {
    await app.close();
    delete process.env.FAKE_AGY_MODE;
    if (fs.existsSync(tmpBaseDir)) {
      fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    }
  });

  it('automatically picks ready task, isolates worktree, commits, pushes branch, and moves task to in_review', async () => {
    process.env.FAKE_AGY_MODE = 'success';

    // 1. Create a ready task on the Hub
    const createRes = await fetch(`${hubUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: 'proj-m4',
        title: 'Implement Database Migrations for M4',
        description: 'Add migration scripts for SQLite schema.',
        acceptance_criteria: '- [ ] Migration passes\n- [ ] Clean rollback',
        role_required: 'backend',
        status: 'ready',
      }),
    });
    expect(createRes.status).toBe(201);
    const { task } = (await createRes.json()) as { task: { id: string } };

    // 2. Initialize daemon
    const config: HubdConfig = {
      hubUrl,
      token: adminToken,
      agentName: 'backend-worker-1',
      role: 'backend',
      repoPath: workRepoPath,
      maxRunsPerDay: 10,
      runTimeoutMinutes: 1,
      agyPath: fakeAgyPath,
      autoApprove: false,
      model: null,
    };

    const daemon = new HubDaemon(config);

    // 3. Execute one daemon cycle
    const tickResult = await daemon.tick();
    expect(tickResult.executed).toBe(true);
    expect(tickResult.taskId).toBe(task.id);

    // 4. Verify task final state on Hub
    const getTaskRes = await fetch(`${hubUrl}/api/v1/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const taskDetail = (await getTaskRes.json()) as {
      task: { status: string; branch: string };
      runs: Array<{ status: string; exit_code: number }>;
      artifacts: Array<{ kind: string; title: string }>;
    };

    // Task must be in_review and reference the agent branch
    expect(taskDetail.task.status).toBe('in_review');
    expect(taskDetail.task.branch).toMatch(/^agent\/backend\//);

    // Run must be succeeded
    expect(taskDetail.runs.length).toBeGreaterThan(0);
    expect(taskDetail.runs[0].status).toBe('succeeded');
    expect(taskDetail.runs[0].exit_code).toBe(0);

    // Artifact of pushed PR/branch must be recorded
    expect(taskDetail.artifacts.length).toBeGreaterThan(0);
    expect(taskDetail.artifacts[0].kind).toBe('pr');

    // 5. Verify branch was actually pushed to origin remote repository!
    const remoteBranches = execFileSync(
      'git',
      ['branch', '--list'],
      { cwd: bareRepoPath, encoding: 'utf8' },
    );
    expect(remoteBranches).toContain(taskDetail.task.branch);

    // 6. Verify worktree was cleanly removed
    const worktreesDir = path.join(workRepoPath, '.worktrees');
    const remainingDirs = fs.existsSync(worktreesDir) ? fs.readdirSync(worktreesDir) : [];
    expect(remainingDirs.length).toBe(0);
  });

  it('marks task as blocked when execution fails without moving status', async () => {
    process.env.FAKE_AGY_MODE = 'fail';

    // Create a task
    const createRes = await fetch(`${hubUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: 'proj-m4',
        title: 'Failing Build Task',
        role_required: 'backend',
        status: 'ready',
      }),
    });
    const { task } = (await createRes.json()) as { task: { id: string } };

    const config: HubdConfig = {
      hubUrl,
      token: adminToken,
      agentName: 'backend-worker-fail',
      role: 'backend',
      repoPath: workRepoPath,
      maxRunsPerDay: 10,
      runTimeoutMinutes: 1,
      agyPath: fakeAgyPath,
      autoApprove: false,
      model: null,
    };

    const daemon = new HubDaemon(config);
    const tickResult = await daemon.tick();
    expect(tickResult.executed).toBe(true);

    // Verify task is marked blocked
    const getTaskRes = await fetch(`${hubUrl}/api/v1/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const taskDetail = (await getTaskRes.json()) as {
      task: { status: string };
      runs: Array<{ status: string }>;
    };
    expect(taskDetail.task.status).toBe('blocked');
    expect(taskDetail.runs[0].status).toBe('failed');
  });

  it('enforces daily run cap', async () => {
    const config: HubdConfig = {
      hubUrl,
      token: adminToken,
      agentName: 'backend-worker-cap',
      role: 'backend',
      repoPath: workRepoPath,
      maxRunsPerDay: 1,
      runTimeoutMinutes: 1,
      agyPath: fakeAgyPath,
      autoApprove: false,
      model: null,
    };

    const daemon = new HubDaemon(config);
    // Simulate runsToday reached
    (daemon as unknown as { state: { runsToday: number } }).state.runsToday = 1;

    const res = await daemon.tick();
    expect(res.executed).toBe(false);
    expect(res.reason).toContain('Daily run cap reached');
  });
});

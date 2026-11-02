import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TaskRunner } from '../runner.js';

describe('Headless TaskRunner with Fake Agy Script', () => {
  let tmpDir: string;
  let fakeAgyPath: string;
  let runner: TaskRunner;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubd-runner-test-'));
    fakeAgyPath = path.resolve(import.meta.dirname, 'fixtures/fake-agy.js');
    runner = new TaskRunner();
  });

  afterEach(() => {
    delete process.env.FAKE_AGY_MODE;
    delete process.env.FAKE_AGY_PROBE_FILE;
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs successfully when fake agy exits with 0', async () => {
    process.env.FAKE_AGY_MODE = 'success';
    const logPath = path.join(tmpDir, 'run.log');

    const result = await runner.runTask({
      agyPath: fakeAgyPath,
      worktreePath: tmpDir,
      prompt: 'Test prompt content',
      logPath,
      timeoutMinutes: 1,
      autoApprove: false,
    });

    expect(result.status).toBe('succeeded');
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(logPath)).toBe(true);
    const logContent = fs.readFileSync(logPath, 'utf8');
    expect(logContent).toContain('[fake-agy] Running in mode: success');
    expect(logContent).toContain('Task execution completed successfully');
  });

  it('detects failure when fake agy exits with non-zero exit code', async () => {
    process.env.FAKE_AGY_MODE = 'fail';
    const logPath = path.join(tmpDir, 'fail.log');

    const result = await runner.runTask({
      agyPath: fakeAgyPath,
      worktreePath: tmpDir,
      prompt: 'Test prompt content',
      logPath,
      timeoutMinutes: 1,
      autoApprove: false,
    });

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
  });

  it('detects rate limit errors and classifies run as rate_limited', async () => {
    process.env.FAKE_AGY_MODE = 'rate_limit';
    const logPath = path.join(tmpDir, 'rate-limit.log');

    const result = await runner.runTask({
      agyPath: fakeAgyPath,
      worktreePath: tmpDir,
      prompt: 'Test prompt content',
      logPath,
      timeoutMinutes: 1,
      autoApprove: false,
    });

    expect(result.status).toBe('rate_limited');
    expect(result.note).toContain('rate limit');
  });

  it('kills runaway process and records timeout when exceeding timeout limit', async () => {
    process.env.FAKE_AGY_MODE = 'timeout';
    const logPath = path.join(tmpDir, 'timeout.log');

    // 0.02 min = 1.2 seconds
    const result = await runner.runTask({
      agyPath: fakeAgyPath,
      worktreePath: tmpDir,
      prompt: 'Test prompt content',
      logPath,
      timeoutMinutes: 0.02,
      autoApprove: false,
    });

    expect(result.status).toBe('timeout');
    expect(result.note).toContain('timed out');
  });

  it('enforces autoApprove security rule: never passes --auto-approve unless explicitly set true', async () => {
    process.env.FAKE_AGY_MODE = 'success';
    const probeFile = path.join(tmpDir, 'args.json');
    process.env.FAKE_AGY_PROBE_FILE = probeFile;

    // Case 1: autoApprove: false
    await runner.runTask({
      agyPath: fakeAgyPath,
      worktreePath: tmpDir,
      prompt: 'Test prompt',
      logPath: path.join(tmpDir, 'no-approve.log'),
      timeoutMinutes: 1,
      autoApprove: false,
    });

    let args = JSON.parse(fs.readFileSync(probeFile, 'utf8')) as string[];
    expect(args).not.toContain('--auto-approve');

    // Case 2: autoApprove: true
    await runner.runTask({
      agyPath: fakeAgyPath,
      worktreePath: tmpDir,
      prompt: 'Test prompt',
      logPath: path.join(tmpDir, 'auto-approve.log'),
      timeoutMinutes: 1,
      autoApprove: true,
    });

    args = JSON.parse(fs.readFileSync(probeFile, 'utf8')) as string[];
    expect(args).toContain('--auto-approve');
  });
});

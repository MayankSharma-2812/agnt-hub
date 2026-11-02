import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  WorktreeManager,
  slugify,
  getBranchName,
} from '../worktree.js';

describe('Git Worktree Isolation Manager', () => {
  let tmpRepo: string;
  let manager: WorktreeManager;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'hubd-worktree-test-'));

    // Initialize temporary git repo with initial commit
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpRepo });

    const readme = path.join(tmpRepo, 'README.md');
    fs.writeFileSync(readme, '# Test Repo\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: tmpRepo });
    execFileSync('git', ['commit', '-m', 'chore: initial commit'], { cwd: tmpRepo });

    manager = new WorktreeManager(tmpRepo);
  });

  afterEach(() => {
    if (fs.existsSync(tmpRepo)) {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('slugifies task titles cleanly', () => {
    expect(slugify('Implement Fastify Hub 2.0 & SSE Stream!')).toBe('implement-fastify-hub-2-0-sse-');
    expect(getBranchName('backend', 'task-123', 'Build MCP Shim')).toBe('agent/backend/task-123-build-mcp-shim');
  });

  it('creates dedicated git worktree on agent branch and cleans it up', () => {
    const branchName = 'agent/backend/task-100-test-feature';
    const info = manager.createWorktree(branchName);

    expect(fs.existsSync(info.worktreePath)).toBe(true);
    expect(info.branch).toBe(branchName);

    // Verify worktree is on the right branch
    const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: info.worktreePath,
      encoding: 'utf8',
    }).trim();
    expect(currentBranch).toBe(branchName);

    // Verify commit detection before any changes
    expect(manager.hasNewCommits(info.worktreePath, branchName)).toBe(false);

    // Make a commit in worktree
    const newFile = path.join(info.worktreePath, 'feature.txt');
    fs.writeFileSync(newFile, 'feature code\n', 'utf8');
    execFileSync('git', ['add', 'feature.txt'], { cwd: info.worktreePath });
    execFileSync('git', ['commit', '-m', 'feat: add feature'], { cwd: info.worktreePath });

    // Verify commit detection after changes
    expect(manager.hasNewCommits(info.worktreePath, branchName)).toBe(true);

    // Clean up worktree
    manager.removeWorktree(info.worktreePath);
    expect(fs.existsSync(info.worktreePath)).toBe(false);
  });

  it('enforces security boundaries: rejects invalid branches and prevents pushing to main', () => {
    expect(() => manager.createWorktree('malicious-branch')).toThrow(/Must start with 'agent\/'/);
    expect(() => manager.pushBranch(tmpRepo, 'main')).toThrow(/Refusing to push directly to main/);
    expect(() => manager.pushBranch(tmpRepo, 'master')).toThrow(/Refusing to push directly to master/);
  });
});

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export function getBranchName(role: string, taskId: string, title: string): string {
  const slug = slugify(title) || 'task';
  return `agent/${role}/${taskId}-${slug}`;
}

export interface WorktreeInfo {
  worktreePath: string;
  branch: string;
}

export class WorktreeManager {
  constructor(private repoPath: string) {
    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }
  }

  /**
   * Creates a dedicated git worktree for the task.
   */
  createWorktree(branchName: string): WorktreeInfo {
    // Safety check: branch must begin with agent/
    if (!branchName.startsWith('agent/')) {
      throw new Error(`Invalid branch name ${branchName}. Must start with 'agent/'`);
    }

    const safeBranchDir = branchName.replace(/\//g, '_');
    const worktreesBaseDir = path.join(this.repoPath, '.worktrees');
    if (!fs.existsSync(worktreesBaseDir)) {
      fs.mkdirSync(worktreesBaseDir, { recursive: true });
    }

    const worktreePath = path.join(worktreesBaseDir, safeBranchDir);

    // If worktree folder already exists, remove it first
    if (fs.existsSync(worktreePath)) {
      this.removeWorktree(worktreePath);
    }

    // Check if branch already exists
    let branchExists = false;
    try {
      execFileSync('git', ['rev-parse', '--verify', branchName], {
        cwd: this.repoPath,
        stdio: 'ignore',
      });
      branchExists = true;
    } catch {
      branchExists = false;
    }

    if (branchExists) {
      execFileSync('git', ['worktree', 'add', worktreePath, branchName], {
        cwd: this.repoPath,
        stdio: 'pipe',
      });
    } else {
      execFileSync('git', ['worktree', 'add', '-b', branchName, worktreePath, 'HEAD'], {
        cwd: this.repoPath,
        stdio: 'pipe',
      });
    }

    return {
      worktreePath,
      branch: branchName,
    };
  }

  /**
   * Safely removes the worktree.
   */
  removeWorktree(worktreePath: string): void {
    try {
      if (fs.existsSync(worktreePath)) {
        execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
          cwd: this.repoPath,
          stdio: 'pipe',
        });
      }
    } catch {
      // Fallback manual cleanup if git worktree remove encounters an edge case
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    } finally {
      try {
        execFileSync('git', ['worktree', 'prune'], {
          cwd: this.repoPath,
          stdio: 'ignore',
        });
      } catch {
        // ignore prune errors
      }
    }
  }

  /**
   * Verifies if any new commits were made on this branch compared to its base commit or main.
   */
  hasNewCommits(worktreePath: string, branchName: string): boolean {
    try {
      // Find default branch (main or master)
      const baseBranch = this.getDefaultBranch();
      const countStr = execFileSync(
        'git',
        ['rev-list', '--count', `${branchName}`, `^${baseBranch}`],
        {
          cwd: worktreePath,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      ).trim();

      const count = parseInt(countStr, 10);
      return !isNaN(count) && count > 0;
    } catch {
      // If rev-list fails, check git status for uncommitted or committed files
      try {
        const status = execFileSync('git', ['status', '--porcelain'], {
          cwd: worktreePath,
          encoding: 'utf8',
        }).trim();
        return status.length > 0;
      } catch {
        return false;
      }
    }
  }

  /**
   * Pushes the branch to remote. NEVER pushes to main or master.
   */
  pushBranch(worktreePath: string, branchName: string, remote: string = 'origin'): void {
    if (branchName === 'main' || branchName === 'master') {
      throw new Error(`SECURITY ALERT: Refusing to push directly to ${branchName}`);
    }

    try {
      execFileSync('git', ['push', '-u', remote, branchName], {
        cwd: worktreePath,
        stdio: 'pipe',
      });
    } catch (err) {
      throw new Error(`Failed to push branch ${branchName} to ${remote}: ${(err as Error).message}`);
    }
  }

  private getDefaultBranch(): string {
    try {
      const branches = execFileSync('git', ['branch', '--list', 'main', 'master'], {
        cwd: this.repoPath,
        encoding: 'utf8',
      });
      if (branches.includes('main')) return 'main';
      if (branches.includes('master')) return 'master';
    } catch {
      // ignore
    }
    return 'HEAD';
  }
}

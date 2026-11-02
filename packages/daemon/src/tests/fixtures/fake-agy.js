#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const mode = process.env.FAKE_AGY_MODE || 'success';

// Record received arguments to a probe file if requested
if (process.env.FAKE_AGY_PROBE_FILE) {
  fs.writeFileSync(process.env.FAKE_AGY_PROBE_FILE, JSON.stringify(args), 'utf8');
}

console.log(`[fake-agy] Running in mode: ${mode}`);
console.log(`[fake-agy] Workspace: ${process.cwd()}`);
console.log(`[fake-agy] Arguments: ${args.join(' ')}`);

switch (mode) {
  case 'success': {
    // ONLY create a commit if strictly inside an isolated git worktree (where .git is a file, not a directory)
    try {
      const gitPath = path.join(process.cwd(), '.git');
      const isWorktree = fs.existsSync(gitPath) && fs.statSync(gitPath).isFile();
      if (isWorktree) {
        const dummyFile = path.join(process.cwd(), 'AGY_OUTPUT.txt');
        fs.writeFileSync(dummyFile, `Implemented task at ${new Date().toISOString()}\n`, 'utf8');
        execFileSync('git', ['add', 'AGY_OUTPUT.txt'], { cwd: process.cwd(), stdio: 'ignore' });
        execFileSync('git', ['commit', '-m', 'feat: implemented task via fake-agy'], {
          cwd: process.cwd(),
          stdio: 'ignore',
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Fake Agy',
            GIT_AUTHOR_EMAIL: 'agy@example.com',
            GIT_COMMITTER_NAME: 'Fake Agy',
            GIT_COMMITTER_EMAIL: 'agy@example.com',
          },
        });
        console.log('[fake-agy] Created git commit');
      }
    } catch {
      // not in a git worktree or commit failed
    }
    console.log('[fake-agy] Task execution completed successfully.');
    process.exit(0);
    break;
  }

  case 'fail': {
    console.error('[fake-agy] Build error: syntax error in generated code');
    process.exit(1);
    break;
  }

  case 'rate_limit': {
    console.error('[fake-agy] API Error 429: Resource exhausted, rate limit exceeded for model.');
    process.exit(429);
    break;
  }

  case 'timeout': {
    console.log('[fake-agy] Simulating long running task...');
    // Sleep indefinitely until killed
    setInterval(() => {}, 10000);
    break;
  }

  default:
    console.log(`[fake-agy] Unknown mode ${mode}`);
    process.exit(0);
}

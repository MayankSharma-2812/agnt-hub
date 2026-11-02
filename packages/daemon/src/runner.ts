import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RunStatus } from '@agent-hub/shared';

export interface RunOptions {
  agyPath: string;
  worktreePath: string;
  prompt: string;
  logPath: string;
  timeoutMinutes: number;
  autoApprove?: boolean;
  model?: string | null;
}

export interface RunResult {
  status: RunStatus;
  exitCode: number | null;
  logPath: string;
  note: string;
  durationMs: number;
}

export class TaskRunner {
  /**
   * Executes the agy process in headless mode inside the worktree.
   */
  async runTask(options: RunOptions): Promise<RunResult> {
    const {
      agyPath,
      worktreePath,
      prompt,
      logPath,
      timeoutMinutes,
      autoApprove = false,
      model,
    } = options;

    // Safety check: ensure worktreePath exists
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Execution aborted: worktree path does not exist: ${worktreePath}`);
    }

    // Prepare log directory and stream
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    }
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    // Save prompt to a temporary file in worktree for reference
    const promptFilePath = path.join(worktreePath, '.task_prompt.md');
    fs.writeFileSync(promptFilePath, prompt, 'utf8');

    // Build agy arguments
    const args: string[] = [];

    if (model) {
      args.push('--model', model);
    }

    // Auto-approve flag: STRICT SECURITY RULE
    // NEVER pass auto-approve flag unless explicitly configured true
    if (autoApprove) {
      args.push('--auto-approve');
    }

    // Pass prompt file or headless argument
    args.push('--prompt-file', promptFilePath);

    const startTime = Date.now();
    logStream.write(`=== HUBD RUN STARTED AT ${new Date().toISOString()} ===\n`);
    logStream.write(`Command: ${agyPath} ${args.join(' ')}\n`);
    logStream.write(`Worktree: ${worktreePath}\n\n`);

    return new Promise<RunResult>((resolve) => {
      let isTimedOut = false;
      let logBuffer = '';

      const child = spawn(agyPath, args, {
        cwd: worktreePath,
        env: {
          ...process.env,
          CI: '1',
          NON_INTERACTIVE: '1',
          WORKSPACE: worktreePath,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Timeout handler
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const timer = setTimeout(() => {
        isTimedOut = true;
        logStream.write(`\n[HUBD TIMEOUT] Process exceeded ${timeoutMinutes} minute(s). Terminating...\n`);
        child.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          try {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          } catch {
            // ignore
          }
        }, 5000).unref();
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        const text = data.toString();
        logBuffer += text;
        logStream.write(data);
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        logBuffer += text;
        logStream.write(data);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        logStream.write(`\n[HUBD ERROR] Process spawn error: ${err.message}\n`);
        logStream.end();
        const durationMs = Date.now() - startTime;
        resolve({
          status: 'failed',
          exitCode: -1,
          logPath,
          note: `Process execution error: ${err.message}`,
          durationMs,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        logStream.write(`\n=== HUBD RUN FINISHED: exit code ${code} (${durationMs}ms) ===\n`);
        logStream.end();

        if (isTimedOut) {
          resolve({
            status: 'timeout',
            exitCode: code,
            logPath,
            note: `Run timed out after ${timeoutMinutes} minutes`,
            durationMs,
          });
          return;
        }

        // Check for rate limit indicators in logs or exit code
        const lowerLogs = logBuffer.toLowerCase();
        const isRateLimited =
          code === 429 ||
          lowerLogs.includes('rate limit') ||
          lowerLogs.includes('quota exceeded') ||
          lowerLogs.includes('resource exhausted') ||
          lowerLogs.includes('rate_limited');

        if (isRateLimited) {
          resolve({
            status: 'rate_limited',
            exitCode: code,
            logPath,
            note: 'Model provider or Hub rate limit encountered during execution',
            durationMs,
          });
          return;
        }

        if (code === 0) {
          resolve({
            status: 'succeeded',
            exitCode: 0,
            logPath,
            note: 'Run completed successfully with exit code 0',
            durationMs,
          });
        } else {
          resolve({
            status: 'failed',
            exitCode: code ?? 1,
            logPath,
            note: `Run exited with non-zero code ${code}`,
            durationMs,
          });
        }
      });
    });
  }
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, getDefaultConfigPath } from './config.js';
import { HubClient } from './client.js';

export interface DoctorCheck {
  title: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  suggestion?: string;
}

export interface DoctorReport {
  overall: 'pass' | 'fail';
  checks: DoctorCheck[];
}

export async function runDoctor(configPath?: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // 1. Node.js >= 20
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 20) {
    checks.push({
      title: 'Node.js Version',
      status: 'pass',
      message: `v${process.versions.node} (>= 20.0.0)`,
    });
  } else {
    checks.push({
      title: 'Node.js Version',
      status: 'fail',
      message: `v${process.versions.node} is unsupported`,
      suggestion: 'Please upgrade to Node.js 20 or higher',
    });
  }

  // 2. Git binary present
  try {
    const gitVer = execFileSync('git', ['--version'], { encoding: 'utf8' }).trim();
    checks.push({
      title: 'Git Binary',
      status: 'pass',
      message: gitVer,
    });
  } catch (err) {
    checks.push({
      title: 'Git Binary',
      status: 'fail',
      message: `git command not found: ${(err as Error).message}`,
      suggestion: 'Install git and ensure it is in your PATH',
    });
  }

  // 3. Config file existence and validation
  let config;
  const targetConfigPath = configPath || getDefaultConfigPath();
  try {
    config = loadConfig(targetConfigPath);
    checks.push({
      title: 'Configuration File',
      status: 'pass',
      message: `Valid config loaded from ${targetConfigPath}`,
    });
  } catch (err) {
    checks.push({
      title: 'Configuration File',
      status: 'fail',
      message: (err as Error).message,
      suggestion: `Run 'hubd init' to generate a valid configuration at ${targetConfigPath}`,
    });
  }

  if (config) {
    // 4. Repo path check
    try {
      if (fs.existsSync(config.repoPath)) {
        execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
          cwd: config.repoPath,
          stdio: 'ignore',
        });
        checks.push({
          title: 'Git Repository Path',
          status: 'pass',
          message: `Valid git repository at ${config.repoPath}`,
        });
      } else {
        checks.push({
          title: 'Git Repository Path',
          status: 'fail',
          message: `Path does not exist: ${config.repoPath}`,
          suggestion: 'Update repoPath in config to your local clone of the repository',
        });
      }
    } catch {
      checks.push({
        title: 'Git Repository Path',
        status: 'fail',
        message: `${config.repoPath} is not a valid git repository`,
        suggestion: 'Ensure repoPath points to a git repository initialized with git init',
      });
    }

    // 5. Worktrees directory write check
    try {
      const testDir = path.join(config.repoPath, '.worktrees');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, '.doctor_probe');
      fs.writeFileSync(testFile, 'ok', 'utf8');
      fs.unlinkSync(testFile);
      checks.push({
        title: 'Worktree Directory Writable',
        status: 'pass',
        message: `Write permissions verified for ${testDir}`,
      });
    } catch (err) {
      checks.push({
        title: 'Worktree Directory Writable',
        status: 'fail',
        message: `Cannot write to .worktrees: ${(err as Error).message}`,
        suggestion: 'Check directory write permissions for your current user',
      });
    }

    // 6. Hub healthcheck
    const client = new HubClient(config);
    try {
      const health = await client.getHealth();
      checks.push({
        title: 'Hub Server Connectivity',
        status: 'pass',
        message: `Hub at ${config.hubUrl} is online (status: ${health.status})`,
      });
    } catch (err) {
      checks.push({
        title: 'Hub Server Connectivity',
        status: 'fail',
        message: `Cannot connect to Hub at ${config.hubUrl}: ${(err as Error).message}`,
        suggestion: 'Ensure apps/hub is running (pnpm --filter @agent-hub/hub dev)',
      });
    }

    // 7. Token validation
    try {
      const me = await client.getMe();
      checks.push({
        title: 'API Token & Member Authentication',
        status: 'pass',
        message: `Authenticated as member "${me.member.name}" (${me.member.email || 'no email'})`,
      });
    } catch (err) {
      checks.push({
        title: 'API Token & Member Authentication',
        status: 'fail',
        message: `Token validation failed: ${(err as Error).message}`,
        suggestion: 'Check your bearer token in hubd.json or issue a new token in Hub dashboard',
      });
    }

    // 8. agy binary check
    try {
      execFileSync(config.agyPath, ['--version'], { stdio: 'ignore' });
      checks.push({
        title: 'Antigravity CLI (agy)',
        status: 'pass',
        message: `Found executable at ${config.agyPath}`,
      });
    } catch {
      // If agyPath doesn't respond to --version, check if file exists or is in PATH
      let exists = false;
      try {
        exists = fs.existsSync(config.agyPath);
      } catch {
        exists = false;
      }

      if (exists) {
        checks.push({
          title: 'Antigravity CLI (agy)',
          status: 'pass',
          message: `Custom runner script located at ${config.agyPath}`,
        });
      } else {
        checks.push({
          title: 'Antigravity CLI (agy)',
          status: 'warn',
          message: `'${config.agyPath}' not found in PATH or filesystem`,
          suggestion: 'Install agy or set agyPath in hubd.json to your test runner script',
        });
      }
    }
  }

  const overall = checks.some((c) => c.status === 'fail') ? 'fail' : 'pass';
  return { overall, checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push('\n=== hubd doctor diagnostics ===\n');

  for (const check of report.checks) {
    const symbol = check.status === 'pass' ? '✓ [PASS]' : check.status === 'warn' ? '! [WARN]' : '✗ [FAIL]';
    lines.push(`${symbol} ${check.title}: ${check.message}`);
    if (check.suggestion) {
      lines.push(`       Suggestion: ${check.suggestion}`);
    }
  }

  lines.push('\n----------------------------------------');
  lines.push(`Overall Status: ${report.overall.toUpperCase()}`);
  lines.push('----------------------------------------\n');

  return lines.join('\n');
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { AGENT_ROLES, AgentRole } from '@agent-hub/shared';

export const HubdConfigSchema = z.object({
  hubUrl: z.string().url().default('http://localhost:3000'),
  token: z.string().min(1, 'Token is required'),
  agentName: z.string().min(1, 'Agent name is required'),
  role: z.enum(AGENT_ROLES),
  repoPath: z.string().min(1, 'Repository path is required'),
  maxRunsPerDay: z.number().int().positive().default(20),
  runTimeoutMinutes: z.number().int().positive().default(45),
  agyPath: z.string().default('agy'),
  autoApprove: z.boolean().default(false),
  model: z.string().optional().nullable(),
});

export type HubdConfig = z.infer<typeof HubdConfigSchema>;

export function getDefaultConfigDir(): string {
  return process.env.HUBD_CONFIG_DIR || path.join(os.homedir(), '.agent-hub');
}

export function getDefaultConfigPath(): string {
  return process.env.HUBD_CONFIG_PATH || path.join(getDefaultConfigDir(), 'hubd.json');
}

export function getDefaultLogsDir(): string {
  return process.env.HUBD_LOGS_DIR || path.join(getDefaultConfigDir(), 'logs');
}

export function getDefaultPidPath(): string {
  return process.env.HUBD_PID_FILE || path.join(getDefaultConfigDir(), 'hubd.pid');
}

export function loadConfig(configPath?: string): HubdConfig {
  const resolvedPath = path.resolve(configPath || getDefaultConfigPath());
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found at ${resolvedPath}. Run 'hubd init' first.`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse config file at ${resolvedPath}: ${(err as Error).message}`);
  }

  const parseResult = HubdConfigSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration in ${resolvedPath}:\n${errorDetails}`);
  }

  return parseResult.data;
}

export function initDefaultConfig(configPath?: string, overrides?: Partial<HubdConfig>): string {
  const targetPath = path.resolve(configPath || getDefaultConfigPath());
  const targetDir = path.dirname(targetPath);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }

  const defaultConfig: HubdConfig = {
    hubUrl: 'http://localhost:3000',
    token: 'REPLACE_WITH_YOUR_BEARER_TOKEN',
    agentName: 'worker-1',
    role: 'backend' as AgentRole,
    repoPath: process.cwd(),
    maxRunsPerDay: 20,
    runTimeoutMinutes: 45,
    agyPath: 'agy',
    autoApprove: false,
    model: null,
    ...overrides,
  };

  fs.writeFileSync(targetPath, JSON.stringify(defaultConfig, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600, // Strict user-only read/write
  });

  // Ensure logs directory exists
  const logsDir = getDefaultLogsDir();
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
  }

  return targetPath;
}

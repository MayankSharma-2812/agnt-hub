import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  HubdConfigSchema,
  loadConfig,
  initDefaultConfig,
} from '../config.js';

describe('Daemon Config Loader', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubd-config-test-'));
    configPath = path.join(tmpDir, 'hubd.json');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('validates a valid configuration with defaults applied', () => {
    const raw = {
      hubUrl: 'http://localhost:3000',
      token: 'test-token',
      agentName: 'worker-1',
      role: 'backend',
      repoPath: '/tmp/repo',
    };

    const parsed = HubdConfigSchema.parse(raw);
    expect(parsed.maxRunsPerDay).toBe(20);
    expect(parsed.runTimeoutMinutes).toBe(45);
    expect(parsed.autoApprove).toBe(false);
    expect(parsed.agyPath).toBe('agy');
  });

  it('rejects invalid role and missing token', () => {
    const raw = {
      hubUrl: 'http://localhost:3000',
      agentName: 'worker-1',
      role: 'invalid-role',
      repoPath: '/tmp/repo',
    };

    const res = HubdConfigSchema.safeParse(raw);
    expect(res.success).toBe(false);
  });

  it('initializes default config with 0600 file permissions', () => {
    const createdPath = initDefaultConfig(configPath, {
      token: 'custom-token',
      role: 'frontend',
    });

    expect(fs.existsSync(createdPath)).toBe(true);
    const stat = fs.statSync(createdPath);
    // Mode should be 0600 (read/write by owner only)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);

    const loaded = loadConfig(createdPath);
    expect(loaded.token).toBe('custom-token');
    expect(loaded.role).toBe('frontend');
    expect(loaded.runTimeoutMinutes).toBe(45);
  });

  it('throws descriptive error if config file does not exist', () => {
    expect(() => loadConfig('/non/existent/path/hubd.json')).toThrow(/Config file not found/);
  });
});

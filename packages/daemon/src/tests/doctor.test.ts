import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FastifyInstance } from 'fastify';
import { initDatabase } from '../../../../apps/hub/src/db/database.js';
import { buildApp } from '../../../../apps/hub/src/app.js';
import { runDoctor, formatDoctorReport } from '../doctor.js';
import { initDefaultConfig } from '../config.js';

describe('hubd doctor Diagnostics', () => {
  let app: FastifyInstance;
  let hubUrl: string;
  let adminToken: string;
  let tmpDir: string;
  let configPath: string;

  beforeAll(async () => {
    const { db, adminToken: token } = initDatabase(':memory:');
    adminToken = token!;
    app = buildApp(db);
    const address = await app.listen({ port: 3965, host: '127.0.0.1' });
    hubUrl = address;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubd-doctor-test-'));
    configPath = path.join(tmpDir, 'hubd.json');

    initDefaultConfig(configPath, {
      hubUrl,
      token: adminToken,
      repoPath: process.cwd(),
      agyPath: path.resolve(import.meta.dirname, 'fixtures/fake-agy.js'),
    });
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs doctor checklist successfully when environment is healthy', async () => {
    const report = await runDoctor(configPath);
    expect(report.overall).toBe('pass');

    const titles = report.checks.map((c) => c.title);
    expect(titles).toContain('Node.js Version');
    expect(titles).toContain('Git Binary');
    expect(titles).toContain('Configuration File');
    expect(titles).toContain('Hub Server Connectivity');
    expect(titles).toContain('API Token & Member Authentication');

    const formatted = formatDoctorReport(report);
    expect(formatted).toContain('=== hubd doctor diagnostics ===');
    expect(formatted).toContain('Overall Status: PASS');
  });

  it('fails doctor check when configuration file does not exist', async () => {
    const report = await runDoctor('/non/existent/hubd.json');
    expect(report.overall).toBe('fail');
    const configCheck = report.checks.find((c) => c.title === 'Configuration File');
    expect(configCheck?.status).toBe('fail');
  });
});

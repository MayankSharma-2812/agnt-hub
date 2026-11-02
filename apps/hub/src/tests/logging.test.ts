import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import Database from 'better-sqlite3';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';

describe('Structured JSON Logging & Token Redaction', () => {
  let db: Database.Database;
  let adminToken: string;

  beforeEach(() => {
    const res = initDatabase(':memory:');
    db = res.db;
    adminToken = res.adminToken!;
  });

  afterEach(() => {
    db.close();
  });

  it('outputs structured NDJSON logs with reqId, method, url, and responseTime', async () => {
    const logChunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      },
    });

    const app = buildApp(db, {
      logger: {
        level: 'info',
        stream,
      },
    });

    const customReqId = 'custom-request-id-12345';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': customReqId,
      },
    });

    expect(res.statusCode).toBe(200);
    await app.close();

    const allLogs = logChunks.join('\n');
    expect(allLogs).toContain(customReqId);
    expect(allLogs).toContain('/health');

    // Parse one structured log line
    const jsonLines = logChunks
      .join('')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const completionLog = jsonLines.find((l) => l.msg === 'request completed');
    expect(completionLog).toBeDefined();
    expect(completionLog.reqId).toBe(customReqId);
    expect(completionLog.method).toBe('GET');
    expect(completionLog.url).toBe('/health');
    expect(completionLog.statusCode).toBe(200);
    expect(typeof completionLog.responseTime).toBe('number');
  });

  it('strictly redacts bearer tokens and secrets from headers, queries, and bodies', async () => {
    const logChunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      },
    });

    const app = buildApp(db, {
      logger: {
        level: 'info',
        stream,
      },
    });

    // Make an authenticated request containing tokens in header, query, and body
    const sensitiveToken = adminToken;
    const bodySecret = 'secret-token-to-be-redacted-999';

    await app.inject({
      method: 'GET',
      url: `/api/v1/me?token=${sensitiveToken}`,
      headers: {
        Authorization: `Bearer ${sensitiveToken}`,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tokens',
      headers: {
        Authorization: `Bearer ${sensitiveToken}`,
        'Content-Type': 'application/json',
      },
      body: {
        action: 'create',
        member_id: 'member-1',
        token: bodySecret,
      },
    });

    await app.close();

    const fullLogOutput = logChunks.join('\n');

    // Assert that the raw token NEVER appears anywhere in the log output
    expect(fullLogOutput).not.toContain(sensitiveToken);
    expect(fullLogOutput).not.toContain(bodySecret);

    // Verify redaction was applied
    expect(fullLogOutput).toContain('[REDACTED]');
  });
});

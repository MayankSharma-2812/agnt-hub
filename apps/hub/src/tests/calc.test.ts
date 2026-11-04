import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';

describe('POST /api/v1/calc Endpoint', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    const { db, adminToken } = initDatabase(':memory:');
    token = adminToken!;
    app = buildApp(db);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('performs standard addition', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calc',
      headers: { Authorization: `Bearer ${token}` },
      payload: { operation: 'add', a: 15, b: 27 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe(42);
    expect(body.message).toContain('42');
  });

  it('handles divide by zero with humorous message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calc',
      headers: { Authorization: `Bearer ${token}` },
      payload: { operation: 'divide', a: 100, b: 0 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeNull();
    expect(body.message).toContain('universe politely declined');
  });

  it('computes factorials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calc',
      headers: { Authorization: `Bearer ${token}` },
      payload: { operation: 'factorial', a: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe(120);
    expect(body.message).toContain('120');
  });

  it('rolls random dice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calc',
      headers: { Authorization: `Bearer ${token}` },
      payload: { operation: 'dice', a: 2, b: 6 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeGreaterThanOrEqual(2);
    expect(body.result).toBeLessThanOrEqual(12);
    expect(body.extra?.rolls).toHaveLength(2);
  });
});

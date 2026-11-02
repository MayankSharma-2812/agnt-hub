import { describe, it, expect } from 'vitest';
import { initDatabase } from './db/database.js';
import { buildApp } from './app.js';

describe('Hub server initialization', () => {
  it('initializes and responds to /health', async () => {
    const { db } = initDatabase(':memory:');
    const app = buildApp(db);

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe('ok');
    expect(data.time).toBeDefined();
  });
});

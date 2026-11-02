import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../db/database.js';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

describe('Bearer Token Auth & Rate Limiting', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeEach(() => {
    const res = initDatabase(':memory:');
    adminToken = res.adminToken!;
    app = buildApp(res.db);
  });

  it('rejects requests without token or with invalid token with 401', async () => {
    const noToken = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(noToken.statusCode).toBe(401);

    const badToken = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: 'Bearer totally_fake_token' },
    });
    expect(badToken.statusCode).toBe(401);
  });

  it('allows token issuance and immediately rejects after token revocation', async () => {
    // 1. Create a second member
    const memberRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/members',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Member B', email: 'memberb@test.local' },
    });
    const member = JSON.parse(memberRes.body).member;

    // 2. Issue token for Member B
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tokens',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'create', member_id: member.id, label: 'Member B Token' },
    });
    expect(tokenRes.statusCode).toBe(201);
    const tokenData = JSON.parse(tokenRes.body);
    const memberBToken = tokenData.token;
    const tokenId = tokenData.token_id;

    // 3. Authenticate with Member B's new token
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${memberBToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).member.name).toBe('Member B');

    // 4. Revoke Member B's token
    const revokeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tokens',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'revoke', token_id: tokenId },
    });
    expect(revokeRes.statusCode).toBe(200);

    // 5. Subsequent request with revoked token fails with 401
    const rejectedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${memberBToken}` },
    });
    expect(rejectedRes.statusCode).toBe(401);
    expect(JSON.parse(rejectedRes.body).error.code).toBe('TOKEN_REVOKED');
  });

  it('enforces rate limit of 100 requests per minute', async () => {
    // Issue a dedicated token for rate testing
    const memberRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/members',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Rate Test Member' },
    });
    const member = JSON.parse(memberRes.body).member;

    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tokens',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'create', member_id: member.id },
    });
    const token = JSON.parse(tokenRes.body).token;

    // Send 100 requests
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    }

    // 101st request should receive HTTP 429
    const rateLimitedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(rateLimitedRes.statusCode).toBe(429);
    expect(rateLimitedRes.headers['retry-after']).toBeDefined();
    expect(JSON.parse(rateLimitedRes.body).error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});

import { FastifyRequest, FastifyReply } from 'fastify';
import Database from 'better-sqlite3';
import { hashToken } from '../db/database.js';
import { generateUlid } from './ulid.js';
import { Member, Agent, AgentRole } from '@agent-hub/shared';

export interface AuthenticatedMember extends Member {
  tokenId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    member?: AuthenticatedMember;
    agent?: Agent;
    db: Database.Database;
  }
}

// In-memory rate limiting: 100 requests per 60 seconds per token
interface RateLimitWindow {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateLimitWindow>();

export function checkRateLimit(tokenId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 100;

  const current = rateLimits.get(tokenId);
  if (!current || now > current.resetAt) {
    rateLimits.set(tokenId, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (current.count >= maxRequests) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  current.count++;
  return { allowed: true };
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization Bearer header',
      },
    });
    return;
  }

  const rawToken = authHeader.slice(7).trim();
  const tokenHash = hashToken(rawToken);

  const row = req.db
    .prepare(
      `
      SELECT t.id as token_id, t.revoked_at, m.id, m.name, m.email, m.is_admin, m.created_at
      FROM api_tokens t
      JOIN members m ON t.member_id = m.id
      WHERE t.token_hash = ?
    `,
    )
    .get(tokenHash) as
    | {
        token_id: string;
        revoked_at: string | null;
        id: string;
        name: string;
        email: string | null;
        is_admin: number;
        created_at: string;
      }
    | undefined;

  if (!row) {
    reply.status(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: 'The provided API token is invalid',
      },
    });
    return;
  }

  if (row.revoked_at) {
    reply.status(401).send({
      error: {
        code: 'TOKEN_REVOKED',
        message: 'This API token has been revoked',
      },
    });
    return;
  }

  // Rate limiting check
  const rateResult = checkRateLimit(row.token_id);
  if (!rateResult.allowed) {
    reply
      .status(429)
      .header('Retry-After', rateResult.retryAfter ?? 60)
      .send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit of 100 requests per minute exceeded',
        },
      });
    return;
  }

  // Update last_used_at
  req.db
    .prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?")
    .run(row.token_id);

  req.member = {
    id: row.id,
    name: row.name,
    email: row.email,
    is_admin: row.is_admin,
    created_at: row.created_at,
    tokenId: row.token_id,
  };

  // Resolve agent if x-agent-name is passed
  const agentName = req.headers['x-agent-name'] as string | undefined;
  if (agentName) {
    let agent = req.db
      .prepare('SELECT * FROM agents WHERE member_id = ? AND name = ?')
      .get(row.id, agentName) as Agent | undefined;

    if (!agent) {
      // Auto-register agent under member if it does not exist yet (default role backend)
      const agentRoleHeader = (req.headers['x-agent-role'] as AgentRole) || 'backend';
      const agentId = generateUlid();
      req.db
        .prepare(
          `
        INSERT INTO agents (id, member_id, name, role, status, last_seen_at)
        VALUES (?, ?, ?, ?, 'idle', datetime('now'))
      `,
        )
        .run(agentId, row.id, agentName, agentRoleHeader);

      agent = req.db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
    }
    req.agent = agent;
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.member?.is_admin) {
    reply.status(403).send({
      error: {
        code: 'FORBIDDEN',
        message: 'Administrator privileges required for this action',
      },
    });
  }
}

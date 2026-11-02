import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../services/auth.js';
import { generateUlid } from '../services/ulid.js';
import { hashToken } from '../db/database.js';
import { emitEvent } from '../services/events.js';
import { Agent } from '@agent-hub/shared';

const CreateMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  is_admin: z.number().int().min(0).max(1).default(0),
});

const TokenActionSchema = z.object({
  action: z.enum(['create', 'revoke']),
  member_id: z.string().optional(),
  label: z.string().optional(),
  token_id: z.string().optional(),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/me
  fastify.get('/api/v1/me', { preHandler: [requireAuth] }, async (req) => {
    const agents = req.db
      .prepare('SELECT * FROM agents WHERE member_id = ?')
      .all(req.member!.id) as Agent[];

    return {
      member: req.member,
      current_agent: req.agent ?? null,
      agents,
    };
  });

  // POST /api/v1/admin/members
  fastify.post('/api/v1/admin/members', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const parse = CreateMemberSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid member payload', details: parse.error.issues },
      });
    }

    const { name, email, is_admin } = parse.data;
    const memberId = generateUlid();

    try {
      req.db
        .prepare('INSERT INTO members (id, name, email, is_admin) VALUES (?, ?, ?, ?)')
        .run(memberId, name, email ?? null, is_admin);
    } catch (err: unknown) {
      return reply.status(409).send({
        error: { code: 'MEMBER_EXISTS', message: (err as Error).message },
      });
    }

    emitEvent(req.db, 'member.created', { memberId, name, is_admin }, {
      actorMemberId: req.member!.id,
    });

    const newMember = req.db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    return reply.status(201).send({ member: newMember });
  });

  // POST /api/v1/admin/tokens
  fastify.post('/api/v1/admin/tokens', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const parse = TokenActionSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid token action payload', details: parse.error.issues },
      });
    }

    const data = parse.data;

    if (data.action === 'create') {
      if (!data.member_id) {
        return reply.status(400).send({
          error: { code: 'MISSING_PARAM', message: 'member_id is required to create a token' },
        });
      }

      const tokenId = generateUlid();
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);

      req.db
        .prepare('INSERT INTO api_tokens (id, member_id, token_hash, label) VALUES (?, ?, ?, ?)')
        .run(tokenId, data.member_id, tokenHash, data.label ?? 'API Token');

      emitEvent(req.db, 'token.created', { tokenId, memberId: data.member_id }, {
        actorMemberId: req.member!.id,
      });

      return reply.status(201).send({
        token_id: tokenId,
        member_id: data.member_id,
        token: rawToken,
        note: 'Save this token now; it will not be displayed again.',
      });
    } else {
      // Revoke
      if (!data.token_id) {
        return reply.status(400).send({
          error: { code: 'MISSING_PARAM', message: 'token_id is required to revoke a token' },
        });
      }

      const info = req.db
        .prepare("UPDATE api_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL")
        .run(data.token_id);

      if (info.changes === 0) {
        return reply.status(404).send({
          error: { code: 'TOKEN_NOT_FOUND', message: 'Token not found or already revoked' },
        });
      }

      emitEvent(req.db, 'token.revoked', { tokenId: data.token_id }, {
        actorMemberId: req.member!.id,
      });

      return { success: true, message: 'Token revoked successfully' };
    }
  });
}

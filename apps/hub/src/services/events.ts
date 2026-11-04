import { FastifyReply, FastifyRequest } from 'fastify';
import Database from 'better-sqlite3';
import { Event } from '@agent-hub/shared';

type SseClient = {
  id: string;
  reply: FastifyReply;
};

const sseClients = new Map<string, SseClient>();

export function emitEvent(
  db: Database.Database,
  type: string,
  payload: Record<string, unknown>,
  options?: {
    projectId?: string | null;
    actorAgentId?: string | null;
    actorMemberId?: string | null;
  },
): Event {
  const payloadStr = JSON.stringify(payload);
  const info = db
    .prepare(
      `
    INSERT INTO events (project_id, actor_agent_id, actor_member_id, type, payload)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(
      options?.projectId ?? null,
      options?.actorAgentId ?? null,
      options?.actorMemberId ?? null,
      type,
      payloadStr,
    );

  const eventRow = db
    .prepare('SELECT * FROM events WHERE id = ?')
    .get(info.lastInsertRowid) as Event;

  // Broadcast to connected SSE clients
  broadcastSseEvent(eventRow);

  return eventRow;
}

function broadcastSseEvent(event: Event): void {
  const data = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const [clientId, client] of sseClients.entries()) {
    try {
      client.reply.raw.write(data);
    } catch {
      sseClients.delete(clientId);
    }
  }
}

export function handleSseConnection(
  req: FastifyRequest,
  reply: FastifyReply,
  db: Database.Database,
): void {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('Access-Control-Allow-Origin', '*');
  reply.raw.flushHeaders();

  const clientId = Math.random().toString(36).substring(2);
  sseClients.set(clientId, { id: clientId, reply });

  // Handle Last-Event-ID or since query parameter
  const lastEventIdHeader = req.headers['last-event-id'];
  const sinceQuery = (req.query as { since?: string; close_after_replay?: string })?.since;
  const sinceIdStr = (lastEventIdHeader as string) || sinceQuery;

  if (sinceIdStr) {
    const sinceId = parseInt(sinceIdStr, 10);
    if (!isNaN(sinceId)) {
      const pastEvents = db
        .prepare('SELECT * FROM events WHERE id > ? ORDER BY id ASC')
        .all(sinceId) as Event[];

      for (const ev of pastEvents) {
        reply.raw.write(`id: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`);
      }
    }
  }

  if ((req.query as { close_after_replay?: string })?.close_after_replay === 'true') {
    reply.raw.end();
    return;
  }

  // Periodic keep-alive ping
  const pingInterval = setInterval(() => {
    try {
      reply.raw.write(': ping\n\n');
    } catch {
      clearInterval(pingInterval);
      sseClients.delete(clientId);
    }
  }, 15000);

  req.raw.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(clientId);
  });
}

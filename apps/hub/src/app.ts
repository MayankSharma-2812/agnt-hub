import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { agentRoutes } from './routes/agents.js';
import { messageRoutes } from './routes/messages.js';
import { lockRoutes } from './routes/locks.js';
import { artifactRoutes } from './routes/artifacts.js';
import { runRoutes } from './routes/runs.js';
import { eventRoutes } from './routes/events.js';
import { calcRoutes } from './routes/calc.js';
import { generateUlid } from './services/ulid.js';

export interface BuildAppOptions {
  logger?: boolean | object;
}

export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl.includes('?')) return rawUrl;
  const [basePath, qs] = rawUrl.split('?');
  const params = new URLSearchParams(qs);
  for (const key of Array.from(params.keys())) {
    if (/token|key|secret|password|auth/i.test(key)) {
      params.set(key, '[REDACTED]');
    }
  }
  return `${basePath}?${params.toString()}`;
}

export function buildApp(db: Database.Database, options?: BuildAppOptions): FastifyInstance {
  const defaultLoggerConfig = {
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.Authorization',
        'req.body.token',
        'req.query.token',
        'token',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(req: { id: string; method: string; url: string; headers: Record<string, string | undefined> }) {
        return {
          id: req.id,
          method: req.method,
          url: sanitizeUrl(req.url),
          headers: {
            ...req.headers,
            authorization: req.headers.authorization ? '[REDACTED]' : undefined,
          },
        };
      },
    },
  };

  let loggerOption: boolean | object = false;
  if (options?.logger === false) {
    loggerOption = false;
  } else if (typeof options?.logger === 'object') {
    loggerOption = {
      ...defaultLoggerConfig,
      ...options.logger,
      serializers: {
        ...defaultLoggerConfig.serializers,
        ...(options.logger as { serializers?: Record<string, unknown> }).serializers,
      },
    };
  } else {
    loggerOption = defaultLoggerConfig;
  }

  const app = Fastify({
    logger: loggerOption,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.trim().length > 0) {
        return header.trim();
      }
      return generateUlid();
    },
  });

  // Attach database instance to each request
  app.addHook('onRequest', async (req) => {
    req.db = db;
  });

  // Log structured request completion details if logging is enabled
  if (loggerOption !== false) {
    app.addHook('onResponse', async (req, reply) => {
      req.log.info(
        {
          reqId: req.id,
          method: req.method,
          url: sanitizeUrl(req.url),
          statusCode: reply.statusCode,
          responseTime: reply.elapsedTime,
        },
        'request completed',
      );
    });
  }

  // CORS headers
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Name, X-Agent-Role, Last-Event-ID');
    if (req.method === 'OPTIONS') {
      reply.status(204).send();
    }
  });

  // Standard JSON error handler
  app.setErrorHandler((error: { statusCode?: number; code?: string; message: string }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  });

  // Register routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(projectRoutes);
  app.register(taskRoutes);
  app.register(agentRoutes);
  app.register(messageRoutes);
  app.register(lockRoutes);
  app.register(artifactRoutes);
  app.register(runRoutes);
  app.register(eventRoutes);
  app.register(calcRoutes);

  // Serve static web build if present
  const possiblePaths = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(import.meta.dirname, '../../apps/web/dist'),
    path.resolve(import.meta.dirname, '../../../apps/web/dist'),
    path.resolve(import.meta.dirname, '../apps/web/dist'),
  ];
  for (const distPath of possiblePaths) {
    if (fs.existsSync(distPath)) {
      app.register(fastifyStatic, {
        root: distPath,
        prefix: '/',
      });
      break;
    }
  }

  return app;
}

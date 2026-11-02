import Fastify, { FastifyInstance } from 'fastify';
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

export function buildApp(db: Database.Database): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  // Attach database instance to each request
  app.addHook('onRequest', async (req) => {
    req.db = db;
  });

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

  return app;
}

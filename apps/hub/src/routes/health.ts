import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  const handler = async () => {
    return {
      status: 'ok',
      time: new Date().toISOString(),
    };
  };

  fastify.get('/health', handler);
  fastify.get('/api/v1/health', handler);
}

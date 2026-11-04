import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../services/auth.js';

const CalcSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide', 'power', 'factorial', 'dice', 'quantum_glitch']),
  a: z.number().optional(),
  b: z.number().optional(),
});

function calculateFactorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= Math.min(n, 170); i++) {
    res *= i;
  }
  return res;
}

export async function calcRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/calc
  fastify.post('/api/v1/calc', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CalcSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid calculation payload',
          details: parse.error.issues,
        },
      });
    }

    const { operation, a = 0, b = 0 } = parse.data;

    let result: number | null = null;
    let message = 'Computation complete.';
    let extra: Record<string, unknown> | undefined;

    switch (operation) {
      case 'add':
        result = a + b;
        message = `Sum of ${a} and ${b} equals ${result}.`;
        break;

      case 'subtract':
        result = a - b;
        message = `${a} minus ${b} is ${result}.`;
        break;

      case 'multiply':
        result = a * b;
        message = `${a} multiplied by ${b} equals ${result}!`;
        break;

      case 'divide':
        if (b === 0) {
          result = null;
          message = 'Whoa there! Dividing by zero? The universe politely declined.';
        } else {
          result = a / b;
          message = `${a} divided by ${b} is ${result}.`;
        }
        break;

      case 'power':
        result = Math.pow(a, b);
        message = `${a} to the power of ${b} equals ${result}.`;
        break;

      case 'factorial':
        if (a < 0) {
          result = null;
          message = 'Factorial of negative numbers does not exist in standard reality!';
        } else if (a > 170) {
          result = Infinity;
          message = 'Whoa! Number is too massive, overflowed to infinity!';
        } else {
          result = calculateFactorial(Math.floor(a));
          message = `${Math.floor(a)}! (factorial) is ${result}!`;
        }
        break;

      case 'dice': {
        const sides = Math.max(2, Math.floor(b || 6));
        const count = Math.max(1, Math.min(Math.floor(a || 1), 10));
        const rolls: number[] = [];
        for (let i = 0; i < count; i++) {
          rolls.push(Math.floor(Math.random() * sides) + 1);
        }
        result = rolls.reduce((sum, n) => sum + n, 0);
        message = `Rolled ${count}d${sides}: [${rolls.join(', ')}] = ${result}!`;
        extra = { rolls, sides, count };
        break;
      }

      case 'quantum_glitch':
        result = Math.round((Math.random() * 42000 + 42) * 100) / 100;
        message = 'Quantum flux detected: reality warped the numbers.';
        break;
    }

    return reply.status(200).send({
      operation,
      a,
      b,
      result,
      message,
      ...(extra ? { extra } : {}),
      computed_at: new Date().toISOString(),
    });
  });
}

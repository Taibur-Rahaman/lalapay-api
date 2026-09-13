import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(helmet);
  app.register(cors, {
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true,
    credentials: true,
  });
  app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'lalapay-api',
    version: '0.2.0',
  }));

  const paymentLinkSchema = z.object({
    title: z.string().trim().min(1).max(150),
    amount: z.number().positive().finite(),
    currency: z.string().length(3).transform((v) => v.toUpperCase()).default('BDT'),
    description: z.string().trim().max(1000).optional(),
    customerName: z.string().trim().max(150).optional(),
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().trim().max(30).optional(),
    expiresAt: z.string().datetime().optional(),
    paymentMethods: z.array(z.enum(['bkash', 'nagad'])).min(1).max(2),
  });

  app.post('/api/v1/payment-links', async (request, reply) => {
    const parsed = paymentLinkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: 'Invalid payment link data',
        errors: parsed.error.flatten(),
      });
    }

    // Persistence is added in the database phase. This endpoint deliberately
    // validates the public contract first so the hosted payment flow stays stable.
    return reply.code(201).send({
      success: true,
      data: {
        id: 'pending-implementation',
        ...parsed.data,
        status: 'CREATED',
      },
    });
  });

  return app;
}

export const app = buildApp();

if (process.env.VERCEL !== '1') {
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '0.0.0.0';
  app.listen({ port, host }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

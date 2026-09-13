import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

app.get('/health', async () => ({
  status: 'ok',
  service: 'lalapay-api',
  version: '0.1.0'
}));

const paymentLinkSchema = z.object({
  title: z.string().min(1).max(150),
  amount: z.number().positive(),
  currency: z.string().length(3).default('BDT'),
  description: z.string().max(1000).optional(),
  customerName: z.string().max(150).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().max(30).optional(),
  expiresAt: z.string().datetime().optional(),
  paymentMethods: z.array(z.enum(['bkash', 'nagad'])).min(1)
});

app.post('/api/v1/payment-links', async (request, reply) => {
  const parsed = paymentLinkSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      success: false,
      message: 'Invalid payment link data',
      errors: parsed.error.flatten()
    });
  }

  // Phase 1 foundation only. Persistence and payment-provider execution
  // are intentionally added in the next implementation phases.
  return reply.code(201).send({
    success: true,
    data: {
      id: 'pending-implementation',
      ...parsed.data,
      status: 'CREATED'
    }
  });
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

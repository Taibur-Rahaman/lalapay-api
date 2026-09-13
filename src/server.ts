import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { ensureDatabase, getPool } from './db.js';
import { createBkashPayment, executeBkashPayment, queryBkashPayment } from './providers/bkash.js';

const paymentLinkSchema = z.object({
  title: z.string().trim().min(1).max(150),
  amount: z.number().positive().finite().refine((value) => Math.round(value * 100) === value * 100, { message: 'Amount can have at most 2 decimal places' }),
  currency: z.string().length(3).transform((v) => v.toUpperCase()).default('BDT'),
  description: z.string().trim().max(1000).optional(),
  customerName: z.string().trim().max(150).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().trim().max(30).optional(),
  expiresAt: z.string().datetime().optional(),
  paymentMethods: z.array(z.enum(['bkash', 'nagad'])).min(1).max(2),
}).superRefine((value, ctx) => {
  if (new Set(value.paymentMethods).size !== value.paymentMethods.length) ctx.addIssue({ code: 'custom', path: ['paymentMethods'], message: 'Payment methods must be unique' });
  if (value.currency !== 'BDT') ctx.addIssue({ code: 'custom', path: ['currency'], message: 'Only BDT is currently supported' });
  if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now()) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'expiresAt must be in the future' });
});

function publicId() { return randomBytes(9).toString('base64url'); }
function serializeLink(row: any) {
  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
  return { id: row.public_id, title: row.title, amount: Number(row.amount), currency: row.currency, description: row.description, customerName: row.customer_name, customerEmail: row.customer_email, customerPhone: row.customer_phone, expiresAt: row.expires_at, paymentMethods: row.payment_methods, status: row.status === 'ACTIVE' && expired ? 'EXPIRED' : row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}
function isExpired(row: any) { return row.expires_at && new Date(row.expires_at).getTime() <= Date.now(); }

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(helmet);
  app.register(cors, { origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true, credentials: true });
  app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  app.get('/health', async () => ({ status: 'ok', service: 'lalapay-api', version: '0.4.0', database: Boolean(process.env.DATABASE_URL), bkash: Boolean(process.env.BKASH_BASE_URL && process.env.BKASH_APP_KEY) }));

  app.post('/api/v1/payment-links', async (request, reply) => {
    const parsed = paymentLinkSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, message: 'Invalid payment link data', errors: parsed.error.flatten() });
    try {
      await ensureDatabase(); const data = parsed.data; const id = randomUUID(); const pid = publicId();
      const result = await getPool().query(`INSERT INTO payment_links (id, public_id, title, amount, currency, description, customer_name, customer_email, customer_phone, expires_at, payment_methods) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING *`, [id, pid, data.title, data.amount.toFixed(2), data.currency, data.description ?? null, data.customerName ?? null, data.customerEmail ?? null, data.customerPhone ?? null, data.expiresAt ? new Date(data.expiresAt) : null, JSON.stringify(data.paymentMethods)]);
      return reply.code(201).send({ success: true, data: serializeLink(result.rows[0]) });
    } catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  app.get('/api/v1/payment-links/:id', async (request, reply) => {
    const params = z.object({ id: z.string().trim().min(8).max(32) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ success: false, message: 'Invalid payment link id' });
    try {
      await ensureDatabase(); const result = await getPool().query('SELECT * FROM payment_links WHERE public_id=$1 LIMIT 1', [params.data.id]);
      if (!result.rowCount) return reply.code(404).send({ success: false, message: 'Payment link not found' });
      return reply.send({ success: true, data: serializeLink(result.rows[0]) });
    } catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  app.get('/api/v1/payment-links', async (request, reply) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(10000).default(0) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ success: false, message: 'Invalid pagination' });
    try {
      await ensureDatabase(); const result = await getPool().query('SELECT * FROM payment_links ORDER BY created_at DESC LIMIT $1 OFFSET $2', [query.data.limit, query.data.offset]);
      return reply.send({ success: true, data: result.rows.map(serializeLink), pagination: { limit: query.data.limit, offset: query.data.offset, count: result.rowCount } });
    } catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  app.post('/api/v1/payment-links/:id/pay/bkash', async (request, reply) => {
    const params = z.object({ id: z.string().trim().min(8).max(32) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ success: false, message: 'Invalid payment link id' });
    try {
      await ensureDatabase();
      const link = await getPool().query('SELECT * FROM payment_links WHERE public_id=$1 LIMIT 1', [params.data.id]);
      if (!link.rowCount) return reply.code(404).send({ success: false, message: 'Payment link not found' });
      const row = link.rows[0];
      if (row.status !== 'ACTIVE' || isExpired(row)) return reply.code(410).send({ success: false, message: 'Payment link is expired or inactive' });
      if (!row.payment_methods.includes('bkash')) return reply.code(400).send({ success: false, message: 'bKash is not enabled for this payment link' });

      const txId = randomUUID();
      const created = await getPool().query(`INSERT INTO transactions (id,payment_link_id,provider,amount,currency,status,idempotency_key,customer_name,customer_email,customer_phone) VALUES ($1,$2,'bkash',$3,'BDT','INITIATED',$4,$5,$6,$7) RETURNING id`, [txId, row.id, row.amount, `bkash:${txId}`, row.customer_name, row.customer_email, row.customer_phone]);
      try {
        const payment = await createBkashPayment({ amount: Number(row.amount).toFixed(2), invoice: txId, payerReference: row.customer_phone ?? txId });
        if (!payment.paymentID || !payment.bkashURL) throw new Error(payment.statusMessage ?? 'Invalid bKash create response');
        await getPool().query('UPDATE transactions SET provider_transaction_id=$1,status=\'PENDING\',updated_at=NOW() WHERE id=$2', [payment.paymentID, created.rows[0].id]);
        return reply.send({ success: true, data: { transactionId: txId, paymentId: payment.paymentID, redirectUrl: payment.bkashURL, provider: 'bkash', status: 'PENDING' } });
      } catch (providerError) {
        await getPool().query('UPDATE transactions SET status=\'FAILED\',updated_at=NOW() WHERE id=$1', [txId]);
        throw providerError;
      }
    } catch (error) { request.log.error(error); return reply.code(502).send({ success: false, message: 'Unable to initialize bKash payment' }); }
  });

  app.get('/api/v1/payments/bkash/callback', async (request, reply) => {
    const query = z.object({ paymentID: z.string().min(1), status: z.enum(['success','failure','cancel']).optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ success: false, message: 'Invalid bKash callback' });
    try {
      await ensureDatabase();
      const tx = await getPool().query('SELECT * FROM transactions WHERE provider=\'bkash\' AND provider_transaction_id=$1 LIMIT 1', [query.data.paymentID]);
      if (!tx.rowCount) return reply.code(404).send({ success: false, message: 'Transaction not found' });
      if (query.data.status === 'cancel' || query.data.status === 'failure') {
        await getPool().query('UPDATE transactions SET status=\'FAILED\',updated_at=NOW() WHERE id=$1 AND status<>\'SUCCESS\'', [tx.rows[0].id]);
      } else {
        const executed = await executeBkashPayment(query.data.paymentID);
        const success = executed.transactionStatus === 'Completed' || executed.statusCode === '0000';
        if (success) await getPool().query('UPDATE transactions SET status=\'SUCCESS\',provider_transaction_id=COALESCE($1,provider_transaction_id),updated_at=NOW(),completed_at=NOW() WHERE id=$2', [executed.trxID ?? null, tx.rows[0].id]);
        else await getPool().query('UPDATE transactions SET status=\'FAILED\',updated_at=NOW() WHERE id=$1', [tx.rows[0].id]);
      }
      const frontend = process.env.FRONTEND_URL;
      if (frontend) return reply.redirect(303, `${frontend}/pay/success?transaction=${encodeURIComponent(tx.rows[0].id)}`);
      return reply.send({ success: true, transactionId: tx.rows[0].id });
    } catch (error) { request.log.error(error); return reply.code(502).send({ success: false, message: 'Unable to complete bKash payment' }); }
  });

  app.get('/api/v1/payments/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ success: false, message: 'Invalid transaction id' });
    try {
      await ensureDatabase();
      const result = await getPool().query('SELECT id,provider,amount,currency,status,provider_transaction_id,created_at,updated_at,completed_at FROM transactions WHERE id=$1 LIMIT 1', [params.data.id]);
      if (!result.rowCount) return reply.code(404).send({ success: false, message: 'Transaction not found' });
      return reply.send({ success: true, data: result.rows[0] });
    } catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  return app;
}

export const app = buildApp();
if (process.env.VERCEL !== '1') {
  const port = Number(process.env.PORT ?? 4000); const host = process.env.HOST ?? '0.0.0.0';
  app.listen({ port, host }).catch((error) => { app.log.error(error); process.exit(1); });
}

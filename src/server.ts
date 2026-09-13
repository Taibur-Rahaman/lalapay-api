import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { ensureDatabase, getPool } from './db.js';
import { createBkashPayment, executeBkashPayment, queryBkashPayment } from './providers/bkash.js';
import { createNagadPayment, isNagadSuccess, verifyNagadPayment } from './providers/nagad.js';

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

const idSchema = z.object({ id: z.string().trim().min(8).max(32) });
const idempotencySchema = z.string().trim().min(8).max(150);
function publicId() { return randomBytes(9).toString('base64url'); }
function isExpired(row: any) { return Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now()); }
function serializeLink(row: any) {
  return { id: row.public_id, title: row.title, amount: Number(row.amount), currency: row.currency, description: row.description, customerName: row.customer_name, customerEmail: row.customer_email, customerPhone: row.customer_phone, expiresAt: row.expires_at, paymentMethods: row.payment_methods, status: row.status === 'ACTIVE' && isExpired(row) ? 'EXPIRED' : row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(helmet);
  app.register(cors, { origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true, credentials: true });
  app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  app.get('/health', async () => ({ status: 'ok', service: 'lalapay-api', version: '0.6.0', database: Boolean(process.env.DATABASE_URL), bkash: Boolean(process.env.BKASH_BASE_URL && process.env.BKASH_APP_KEY), nagad: Boolean(process.env.NAGAD_BASE_URL && process.env.NAGAD_MERCHANT_ID && process.env.NAGAD_MERCHANT_PRIVATE_KEY && process.env.NAGAD_PG_PUBLIC_KEY) }));

  app.post('/api/v1/payment-links', async (request, reply) => {
    const parsed = paymentLinkSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, message: 'Invalid payment link data', errors: parsed.error.flatten() });
    try {
      await ensureDatabase(); const data = parsed.data;
      const result = await getPool().query(`INSERT INTO payment_links (public_id,title,amount,currency,description,customer_name,customer_email,customer_phone,expires_at,payment_methods) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`, [publicId(), data.title, data.amount.toFixed(2), data.currency, data.description ?? null, data.customerName ?? null, data.customerEmail ?? null, data.customerPhone ?? null, data.expiresAt ? new Date(data.expiresAt) : null, JSON.stringify(data.paymentMethods)]);
      return reply.code(201).send({ success: true, data: serializeLink(result.rows[0]) });
    } catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  app.get('/api/v1/payment-links/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return reply.code(400).send({ success: false, message: 'Invalid payment link id' });
    try { await ensureDatabase(); const result = await getPool().query('SELECT * FROM payment_links WHERE public_id=$1 LIMIT 1', [params.data.id]); if (!result.rowCount) return reply.code(404).send({ success: false, message: 'Payment link not found' }); return reply.send({ success: true, data: serializeLink(result.rows[0]) }); }
    catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  app.get('/api/v1/payment-links', async (request, reply) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(10000).default(0) }).safeParse(request.query); if (!query.success) return reply.code(400).send({ success: false, message: 'Invalid pagination' });
    try { await ensureDatabase(); const result = await getPool().query('SELECT * FROM payment_links ORDER BY created_at DESC LIMIT $1 OFFSET $2', [query.data.limit, query.data.offset]); return reply.send({ success: true, data: result.rows.map(serializeLink), pagination: { limit: query.data.limit, offset: query.data.offset, count: result.rowCount } }); }
    catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  async function initiate(request: any, reply: any, provider: 'bkash' | 'nagad') {
    const params = idSchema.safeParse(request.params); if (!params.success) return reply.code(400).send({ success: false, message: 'Invalid payment link id' });
    const rawKey = request.headers['idempotency-key']; const parsedKey = typeof rawKey === 'string' ? idempotencySchema.safeParse(rawKey) : null;
    if (!parsedKey?.success) return reply.code(400).send({ success: false, message: 'Idempotency-Key header is required and must be 8-150 characters' });
    try {
      await ensureDatabase(); const db = getPool();
      const linkResult = await db.query('SELECT * FROM payment_links WHERE public_id=$1 LIMIT 1', [params.data.id]);
      if (!linkResult.rowCount) return reply.code(404).send({ success: false, message: 'Payment link not found' });
      const link = linkResult.rows[0];
      if (link.status !== 'ACTIVE' || isExpired(link)) return reply.code(410).send({ success: false, message: 'Payment link is expired or inactive' });
      if (!Array.isArray(link.payment_methods) || !link.payment_methods.includes(provider)) return reply.code(400).send({ success: false, message: `${provider} is not enabled for this payment link` });

      const key = `${provider}:${params.data.id}:${parsedKey.data}`;
      let existing = await db.query('SELECT * FROM transactions WHERE payment_link_id=$1 AND provider=$2 AND idempotency_key=$3 LIMIT 1', [link.id, provider, key]);
      if (existing.rowCount) {
        const tx = existing.rows[0];
        if (tx.status === 'SUCCESS' || tx.status === 'PENDING') return reply.send({ success: true, data: { transactionId: tx.id, paymentId: tx.provider_payment_id, redirectUrl: tx.provider_redirect_url, provider, status: tx.status }, reused: true });
        if (tx.status === 'INITIATED' && tx.provider_payment_id) return reply.send({ success: true, data: { transactionId: tx.id, paymentId: tx.provider_payment_id, redirectUrl: tx.provider_redirect_url, provider, status: tx.status }, reused: true });
        await db.query('DELETE FROM transactions WHERE id=$1', [tx.id]);
      }

      const txResult = await db.query(`INSERT INTO transactions (payment_link_id,provider,amount,currency,status,idempotency_key,customer_name,customer_email,customer_phone) VALUES ($1,$2,$3,$4,'INITIATED',$5,$6,$7,$8) RETURNING *`, [link.id, provider, link.amount, link.currency, key, link.customer_name, link.customer_email, link.customer_phone]);
      const tx = txResult.rows[0];
      try {
        const payment = provider === 'bkash'
          ? await createBkashPayment({ amount: Number(link.amount).toFixed(2), invoice: tx.id, payerReference: link.customer_phone ?? tx.id })
          : await createNagadPayment({ amount: Number(link.amount).toFixed(2), invoice: tx.id });
        const paymentId = provider === 'bkash' ? payment.paymentID : payment.paymentReferenceId;
        const redirectUrl = provider === 'bkash' ? payment.bkashURL : payment.redirectUrl;
        if (!paymentId || !redirectUrl) throw new Error('Provider returned an incomplete checkout response');
        const updated = await db.query('UPDATE transactions SET provider_payment_id=$1,provider_redirect_url=$2,status=\'PENDING\',updated_at=NOW() WHERE id=$3 RETURNING *', [paymentId, redirectUrl, tx.id]);
        return reply.send({ success: true, data: { transactionId: updated.rows[0].id, paymentId, redirectUrl, provider, status: 'PENDING' }, reused: false });
      } catch (providerError) {
        await db.query('UPDATE transactions SET status=\'FAILED\',updated_at=NOW() WHERE id=$1', [tx.id]);
        throw providerError;
      }
    } catch (error) { request.log.error(error); return reply.code(502).send({ success: false, message: `Unable to initialize ${provider} payment` }); }
  }

  app.post('/api/v1/payment-links/:id/pay/bkash', (request, reply) => initiate(request, reply, 'bkash'));
  app.post('/api/v1/payment-links/:id/pay/nagad', (request, reply) => initiate(request, reply, 'nagad'));

  app.get('/api/v1/payments/bkash/callback', async (request, reply) => {
    const query = z.object({ paymentID: z.string().min(1), status: z.enum(['success','failure','cancel']).optional() }).safeParse(request.query); if (!query.success) return reply.code(400).send({ success: false, message: 'Invalid bKash callback' });
    try {
      await ensureDatabase(); const db = getPool(); const result = await db.query('SELECT * FROM transactions WHERE provider=\'bkash\' AND provider_payment_id=$1 LIMIT 1', [query.data.paymentID]);
      if (!result.rowCount) return reply.code(404).send({ success: false, message: 'Transaction not found' });
      const tx = result.rows[0];
      if (tx.status !== 'SUCCESS') {
        if (query.data.status === 'cancel' || query.data.status === 'failure') await db.query('UPDATE transactions SET status=\'FAILED\',updated_at=NOW() WHERE id=$1 AND status<>\'SUCCESS\'', [tx.id]);
        else {
          let verified: any;
          try { verified = await executeBkashPayment(query.data.paymentID); } catch { verified = await queryBkashPayment(query.data.paymentID); }
          if (verified.transactionStatus === 'Completed' || verified.statusCode === '0000') await db.query('UPDATE transactions SET status=\'SUCCESS\',provider_transaction_id=COALESCE($1,provider_transaction_id),updated_at=NOW(),completed_at=NOW() WHERE id=$2', [verified.trxID ?? null, tx.id]);
          else if (verified.transactionStatus === 'Initiated' || verified.transactionStatus === 'Pending') await db.query('UPDATE transactions SET status=\'PENDING\',updated_at=NOW() WHERE id=$1', [tx.id]);
          else await db.query('UPDATE transactions SET status=\'FAILED\',updated_at=NOW() WHERE id=$1', [tx.id]);
        }
      }
      const frontend = process.env.FRONTEND_URL; if (frontend) return reply.redirect(303, `${frontend}/pay/success?transaction=${encodeURIComponent(tx.id)}`); return reply.send({ success: true, transactionId: tx.id });
    } catch (error) { request.log.error(error); return reply.code(502).send({ success: false, message: 'Unable to complete bKash payment' }); }
  });

  app.get('/api/v1/payments/nagad/callback', async (request, reply) => {
    const query = z.object({ payment_ref_id: z.string().min(1), status: z.string().optional(), status_code: z.string().optional(), issuer_payment_ref: z.string().optional() }).safeParse(request.query); if (!query.success) return reply.code(400).send({ success: false, message: 'Invalid Nagad callback' });
    try {
      await ensureDatabase(); const db = getPool(); const result = await db.query('SELECT * FROM transactions WHERE provider=\'nagad\' AND provider_payment_id=$1 LIMIT 1', [query.data.payment_ref_id]);
      if (!result.rowCount) return reply.code(404).send({ success: false, message: 'Transaction not found' });
      const tx = result.rows[0];
      if (tx.status !== 'SUCCESS') {
        const verified = await verifyNagadPayment(query.data.payment_ref_id);
        if (isNagadSuccess(verified.status)) await db.query('UPDATE transactions SET status=\'SUCCESS\',provider_transaction_id=COALESCE($1,provider_transaction_id),updated_at=NOW(),completed_at=NOW() WHERE id=$2', [verified.issuerPaymentRefNo ?? query.data.issuer_payment_ref ?? null, tx.id]);
        else if (['OrderInitiated','Ready','InProgress','OtpSent','OtpVerified','PinGiven'].includes(String(verified.status))) await db.query('UPDATE transactions SET status=\'PENDING\',updated_at=NOW() WHERE id=$1', [tx.id]);
        else await db.query('UPDATE transactions SET status=\'FAILED\',updated_at=NOW() WHERE id=$1', [tx.id]);
      }
      const frontend = process.env.FRONTEND_URL; if (frontend) return reply.redirect(303, `${frontend}/pay/success?transaction=${encodeURIComponent(tx.id)}`); return reply.send({ success: true, transactionId: tx.id });
    } catch (error) { request.log.error(error); return reply.code(502).send({ success: false, message: 'Unable to verify Nagad payment' }); }
  });

  app.get('/api/v1/payments/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params); if (!params.success) return reply.code(400).send({ success: false, message: 'Invalid transaction id' });
    try { await ensureDatabase(); const result = await getPool().query('SELECT id,provider,amount,currency,status,provider_payment_id,provider_transaction_id,created_at,updated_at,completed_at FROM transactions WHERE id=$1 LIMIT 1', [params.data.id]); if (!result.rowCount) return reply.code(404).send({ success: false, message: 'Transaction not found' }); return reply.send({ success: true, data: result.rows[0] }); }
    catch (error) { request.log.error(error); return reply.code(503).send({ success: false, message: 'Database is unavailable' }); }
  });

  return app;
}

export const app = buildApp();
if (process.env.VERCEL !== '1') {
  const port = Number(process.env.PORT ?? 4000); const host = process.env.HOST ?? '0.0.0.0';
  app.listen({ port, host }).catch((error) => { app.log.error(error); process.exit(1); });
}

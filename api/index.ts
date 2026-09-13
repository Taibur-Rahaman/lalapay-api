import { app } from '../src/server.js';
import { ensureDatabase, getPool, pingDatabase } from '../src/db.js';

function paymentRouteInfo(request: any) {
  const path = String(request.url ?? '').split('?')[0];
  const match = path.match(/^\/api\/v1\/payment-links\/([^/]+)\/pay\/(bkash|nagad)$/);
  const key = typeof request.headers?.['idempotency-key'] === 'string' ? request.headers['idempotency-key'].trim() : '';
  if (request.method !== 'POST' || !match || !key) return null;
  return { paymentLinkId: match[1], provider: match[2] as 'bkash' | 'nagad', key };
}

export default async function handler(request: any, response: any) {
  let lockClient: any;
  let lockReleased = false;
  const releaseLock = async () => {
    if (!lockClient || lockReleased) return;
    lockReleased = true;
    try { await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [paymentRouteInfo(request)?.key ?? '']); } catch (error) { console.error('LalaPay idempotency unlock failed:', error instanceof Error ? error.message : 'unknown error'); }
    try { lockClient.release(); } catch { /* already released */ }
    lockClient = undefined;
  };

  try {
    const path = String(request.url ?? '').split('?')[0];

    if (path === '/health/ready') {
      try {
        await pingDatabase();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ status: 'ready', service: 'lalapay-api' }));
      } catch (error) {
        console.error('LalaPay readiness check failed:', error instanceof Error ? error.message : 'unknown error');
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ status: 'not_ready', service: 'lalapay-api', database: false }));
      }
      return;
    }

    const info = paymentRouteInfo(request);
    if (info) {
      if (info.key.length < 8 || info.key.length > 150) {
        response.statusCode = 400;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ success: false, message: 'A valid Idempotency-Key is required' }));
        return;
      }

      await ensureDatabase();
      lockClient = await getPool().connect();
      await lockClient.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [info.key]);

      // Enforce idempotency across provider and payment-link boundaries for the same merchant.
      const existing = await lockClient.query(`
        SELECT t.id,t.provider,t.provider_payment_id,t.provider_redirect_url,t.status
        FROM transactions t
        JOIN payment_links pl ON pl.id=t.payment_link_id
        WHERE pl.merchant_id=(SELECT merchant_id FROM payment_links WHERE public_id=$1 LIMIT 1)
          AND t.idempotency_key=$2
        ORDER BY t.created_at ASC
        LIMIT 1
      `, [info.paymentLinkId, info.key]);

      if (existing.rowCount) {
        const tx = existing.rows[0];
        if (tx.provider !== info.provider) {
          response.statusCode = 409;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ success: false, message: 'Idempotency-Key is already bound to another provider', transactionId: tx.id }));
          await releaseLock();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ success: true, data: { transactionId: tx.id, paymentId: tx.provider_payment_id, redirectUrl: tx.provider_redirect_url, provider: tx.provider, status: tx.status }, reused: true }));
        await releaseLock();
        return;
      }

      response.once('finish', releaseLock);
      response.once('close', releaseLock);
    }

    await app.ready();
    app.server.emit('request', request, response);
  } catch (error) {
    await releaseLock();
    console.error('LalaPay Vercel handler failed:', error instanceof Error ? error.message : 'unknown error');
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ success: false, message: 'Internal server error' }));
    }
  }
}

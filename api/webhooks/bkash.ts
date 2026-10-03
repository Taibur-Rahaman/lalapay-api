import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureDatabase, getPool } from '../../src/db.js';
import { applyVerifiedSettlement } from '../../src/payments/atomic-settlement.js';
import { claimWebhook, markWebhookProcessed, payloadHash } from '../../src/webhooks/replay-guard.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    await ensureDatabase();
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const body = typeof req.body === 'object' && req.body ? req.body as Record<string, unknown> : JSON.parse(raw);
    const eventId = String(req.headers['x-bkash-event-id'] ?? body.eventId ?? body.paymentID ?? body.trxID ?? '');
    const paymentId = String(body.paymentID ?? body.paymentId ?? '');
    const trxId = String(body.trxID ?? body.transactionId ?? '');
    const webhookStatus = String(body.status ?? '').toUpperCase();
    const webhookAmount = Number(body.amount ?? body.paymentAmount ?? NaN);
    if (!eventId || !paymentId) return res.status(400).json({ error: 'INVALID_WEBHOOK' });
    const claimed = await claimWebhook({ provider: 'bkash', eventId, payloadHash: payloadHash(raw) });
    if (!claimed) return res.status(200).json({ ok: true, duplicate: true });

    const db = getPool();
    const result = await db.query(`SELECT id, amount, currency, status FROM transactions WHERE provider='bkash' AND provider_payment_id=$1 LIMIT 1`, [paymentId]);
    if (result.rowCount !== 1) return res.status(202).json({ ok: true, accepted: true });
    const tx = result.rows[0];

    if (webhookStatus === 'SUCCESS' && trxId) {
      const amount = Number.isFinite(webhookAmount) ? webhookAmount : Number(tx.amount);
      const settlement = await applyVerifiedSettlement({
        transactionId: String(tx.id),
        providerTransactionId: trxId,
        amount,
        currency: String(tx.currency),
      });
      await markWebhookProcessed('bkash', eventId);
      return res.status(200).json({ ok: true, paymentId, transactionId: trxId, status: settlement.status, applied: settlement.applied });
    }

    await markWebhookProcessed('bkash', eventId);
    return res.status(200).json({ ok: true, paymentId, transactionId: trxId || null, status: tx.status });
  } catch (error) {
    console.error('bKash webhook error:', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: 'WEBHOOK_PROCESSING_FAILED' });
  }
}

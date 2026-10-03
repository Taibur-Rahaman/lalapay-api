import { createHash } from 'node:crypto';
import { getPool } from '../db.js';

export function payloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

export async function claimWebhook(input: { provider: 'bkash' | 'nagad'; eventId: string; payloadHash: string }): Promise<boolean> {
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS webhook_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider VARCHAR(20) NOT NULL, event_id VARCHAR(200) NOT NULL, payload_hash CHAR(64) NOT NULL, processed BOOLEAN NOT NULL DEFAULT FALSE, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ NULL, UNIQUE(provider,event_id), UNIQUE(provider,payload_hash))`);
  const result = await db.query(`INSERT INTO webhook_events(provider,event_id,payload_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [input.provider, input.eventId, input.payloadHash]);
  return result.rowCount === 1;
}

export async function markWebhookProcessed(provider: string, eventId: string): Promise<void> {
  await getPool().query(`UPDATE webhook_events SET processed=true, processed_at=NOW() WHERE provider=$1 AND event_id=$2`, [provider, eventId]);
}

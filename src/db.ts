import { Pool } from 'pg';

let pool: Pool | undefined;
let initialized = false;
let initializationPromise: Promise<void> | undefined;

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function ensureDatabase() {
  if (initialized) return;
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const db = getPool();
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await db.query(`
      CREATE TABLE IF NOT EXISTS payment_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        public_id VARCHAR(32) NOT NULL UNIQUE,
        merchant_id UUID NULL,
        title VARCHAR(150) NOT NULL,
        amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL DEFAULT 'BDT',
        description TEXT NULL,
        customer_name VARCHAR(150) NULL,
        customer_email VARCHAR(320) NULL,
        customer_phone VARCHAR(30) NULL,
        expires_at TIMESTAMPTZ NULL,
        payment_methods JSONB NOT NULL DEFAULT '["bkash","nagad"]'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS payment_links_status_created_idx ON payment_links (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS payment_links_expires_at_idx ON payment_links (expires_at);

      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_link_id UUID NOT NULL REFERENCES payment_links(id) ON DELETE RESTRICT,
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('bkash', 'nagad')),
        amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL DEFAULT 'BDT',
        status VARCHAR(30) NOT NULL DEFAULT 'INITIATED',
        provider_payment_id VARCHAR(150) NULL,
        provider_transaction_id VARCHAR(150) NULL,
        idempotency_key VARCHAR(150) NULL,
        customer_name VARCHAR(150) NULL,
        customer_email VARCHAR(320) NULL,
        customer_phone VARCHAR(30) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ NULL
      );
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(150) NULL;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_transaction_id VARCHAR(150) NULL;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150) NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_unique_idx ON transactions (payment_link_id, provider, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS transactions_payment_link_idx ON transactions (payment_link_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS transactions_provider_payment_idx ON transactions (provider, provider_payment_id);
      CREATE INDEX IF NOT EXISTS transactions_provider_tx_idx ON transactions (provider, provider_transaction_id);
    `);
    initialized = true;
  })();
  try { await initializationPromise; } finally { initializationPromise = undefined; }
}

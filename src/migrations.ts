import { getPool } from './db.js';

const migrations: Array<{ version: string; sql: string }> = [
  { version: '001_operational_baseline', sql: `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS schema_migrations_applied_idx ON schema_migrations(applied_at DESC);` },
];

let done = false;
let running: Promise<void> | undefined;
export async function runMigrations() {
  if (done) return;
  if (running) return running;
  running = (async () => {
    const db = getPool();
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    for (const migration of migrations) {
      const exists = await db.query('SELECT 1 FROM schema_migrations WHERE version=$1', [migration.version]);
      if (exists.rowCount) continue;
      await db.query('BEGIN');
      try {
        await db.query(migration.sql);
        await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [migration.version]);
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    }
    done = true;
  })().finally(() => { running = undefined; });
  return running;
}

import { getPool } from '../db.js';

export type SettlementResult =
  | { applied: true; status: 'SUCCESS' }
  | { applied: false; status: string };

export async function applyVerifiedSettlement(input: {
  transactionId: string;
  providerTransactionId: string;
  amount: number;
  currency: string;
}): Promise<SettlementResult> {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, amount, currency, status, provider_transaction_id
         FROM transactions
        WHERE id = $1
        FOR UPDATE`,
      [input.transactionId],
    );
    if (result.rowCount !== 1) throw new Error('TRANSACTION_NOT_FOUND');
    const tx = result.rows[0];
    if (Math.abs(Number(tx.amount) - input.amount) > 0.00001) throw new Error('AMOUNT_MISMATCH');
    if (String(tx.currency).toUpperCase() !== input.currency.toUpperCase()) throw new Error('CURRENCY_MISMATCH');
    if (tx.status === 'SUCCESS') {
      await client.query('COMMIT');
      return { applied: false, status: 'SUCCESS' };
    }
    if (tx.provider_transaction_id && tx.provider_transaction_id !== input.providerTransactionId) {
      throw new Error('PROVIDER_TRANSACTION_MISMATCH');
    }
    await client.query(
      `UPDATE transactions
          SET status = 'SUCCESS', provider_transaction_id = $1,
              completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
        WHERE id = $2`,
      [input.providerTransactionId, input.transactionId],
    );
    await client.query('COMMIT');
    return { applied: true, status: 'SUCCESS' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

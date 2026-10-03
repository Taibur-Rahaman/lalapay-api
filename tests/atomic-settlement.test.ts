import { describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const release = vi.fn();
const connect = vi.fn(async () => ({ query, release }));

vi.mock('../src/db.js', () => ({ getPool: () => ({ connect }) }));

import { applyVerifiedSettlement } from '../src/payments/atomic-settlement.js';

describe('atomic verified settlement', () => {
  it('settles a pending transaction exactly once', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tx-1', amount: '100.00', currency: 'BDT', status: 'PENDING', provider_transaction_id: null }] });
    query.mockResolvedValueOnce({});
    query.mockResolvedValueOnce({});

    const result = await applyVerifiedSettlement({ transactionId: 'tx-1', providerTransactionId: 'TRX-1', amount: 100, currency: 'BDT' });
    expect(result).toEqual({ applied: true, status: 'SUCCESS' });
    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('does not update an already successful transaction', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tx-2', amount: '100.00', currency: 'BDT', status: 'SUCCESS', provider_transaction_id: 'TRX-2' }] });
    query.mockResolvedValueOnce({});

    const result = await applyVerifiedSettlement({ transactionId: 'tx-2', providerTransactionId: 'TRX-2', amount: 100, currency: 'BDT' });
    expect(result).toEqual({ applied: false, status: 'SUCCESS' });
    expect(query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects amount mismatch and rolls back', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tx-3', amount: '100.00', currency: 'BDT', status: 'PENDING', provider_transaction_id: null }] });
    query.mockResolvedValueOnce({});

    await expect(applyVerifiedSettlement({ transactionId: 'tx-3', providerTransactionId: 'TRX-3', amount: 90, currency: 'BDT' })).rejects.toThrow('AMOUNT_MISMATCH');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects currency mismatch and rolls back', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tx-4', amount: '100.00', currency: 'BDT', status: 'PENDING', provider_transaction_id: null }] });
    query.mockResolvedValueOnce({});

    await expect(applyVerifiedSettlement({ transactionId: 'tx-4', providerTransactionId: 'TRX-4', amount: 100, currency: 'USD' })).rejects.toThrow('CURRENCY_MISMATCH');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects a conflicting provider transaction id', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tx-5', amount: '100.00', currency: 'BDT', status: 'PENDING', provider_transaction_id: 'TRX-OLD' }] });
    query.mockResolvedValueOnce({});

    await expect(applyVerifiedSettlement({ transactionId: 'tx-5', providerTransactionId: 'TRX-NEW', amount: 100, currency: 'BDT' })).rejects.toThrow('PROVIDER_TRANSACTION_MISMATCH');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });
});

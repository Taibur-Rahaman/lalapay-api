import { describe, expect, it } from 'vitest';
import { validateIdempotencyKey, whmcsRequestFingerprint } from '../src/integrations/whmcs-idempotency.js';

describe('WHMCS idempotency helpers', () => {
  it('produces the same fingerprint for equivalent input', () => {
    const a = whmcsRequestFingerprint({ invoiceId: '1001', amount: 100, currency: 'bdt', customer: { email: 'USER@example.com' } });
    const b = whmcsRequestFingerprint({ invoiceId: '1001', amount: 100.0, currency: 'BDT', customer: { email: 'user@example.com' } });
    expect(a).toBe(b);
  });

  it('rejects invalid idempotency keys', () => {
    expect(() => validateIdempotencyKey('short')).toThrow('INVALID_IDEMPOTENCY_KEY');
  });

  it('accepts a normal idempotency key', () => {
    expect(validateIdempotencyKey('whmcs-invoice-1001-abc')).toBe('whmcs-invoice-1001-abc');
  });
});

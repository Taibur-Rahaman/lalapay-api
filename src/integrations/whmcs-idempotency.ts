import { createHash } from 'node:crypto';

export function whmcsRequestFingerprint(input: {
  invoiceId: string;
  amount: number;
  currency: string;
  customer?: { name?: string; email?: string; phone?: string };
}): string {
  const canonical = JSON.stringify({
    invoiceId: input.invoiceId.trim(),
    amount: Number(input.amount).toFixed(2),
    currency: input.currency.trim().toUpperCase(),
    customer: {
      name: input.customer?.name?.trim() ?? '',
      email: input.customer?.email?.trim().toLowerCase() ?? '',
      phone: input.customer?.phone?.trim() ?? '',
    },
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateIdempotencyKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key.length < 8 || key.length > 150) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return key;
}

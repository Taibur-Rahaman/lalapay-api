export const PAYMENT_STATUSES = [
  'CREATED',
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['PENDING', 'CANCELLED', 'EXPIRED'],
  PENDING: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid payment state transition: ${from} -> ${to}`);
  }
}

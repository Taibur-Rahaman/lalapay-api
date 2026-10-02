import type { PaymentStatus } from '../domain/payment';

export type PaymentProvider = 'BKASH' | 'NAGAD';

export type CreatePaymentInput = {
  paymentId: string;
  amount: number;
  currency: string;
  callbackUrl?: string;
};

export type ProviderPaymentResult = {
  providerPaymentId: string;
  checkoutUrl?: string;
  status: PaymentStatus;
  transactionId?: string;
};

export interface PaymentProviderAdapter {
  readonly name: PaymentProvider;
  createPayment(input: CreatePaymentInput): Promise<ProviderPaymentResult>;
  verifyPayment(input: { paymentId: string; providerPaymentId?: string }): Promise<ProviderPaymentResult>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: PaymentProvider) {
    super(`${provider} provider is not configured`);
    this.name = 'ProviderNotConfiguredError';
  }
}

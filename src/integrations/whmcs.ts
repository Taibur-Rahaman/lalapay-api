export type WhmcsPaymentStatus = {
  paymentId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  status: string;
  transactionId?: string;
  checkoutUrl?: string;
};

/**
 * Contract used by the WHMCS gateway.
 * The route layer should authenticate the merchant before calling these
 * functions and load the payment only within that merchant's scope.
 */
export interface WhmcsPaymentRepository {
  create(input: {
    merchantId: string;
    invoiceId: string;
    amount: number;
    currency: string;
    customer?: { name?: string; email?: string; phone?: string };
    returnUrl?: string;
    callbackUrl?: string;
  }): Promise<WhmcsPaymentStatus>;

  getStatus(input: {
    merchantId: string;
    paymentId: string;
  }): Promise<WhmcsPaymentStatus | null>;
}

export function assertWhmcsAmount(
  expectedAmount: number,
  actualAmount: number,
): void {
  if (!Number.isFinite(expectedAmount) || !Number.isFinite(actualAmount)) {
    throw new Error('INVALID_AMOUNT');
  }

  if (Math.abs(expectedAmount - actualAmount) > 0.00001) {
    throw new Error('AMOUNT_MISMATCH');
  }
}

export function assertWhmcsCurrency(
  expectedCurrency: string,
  actualCurrency: string,
): void {
  if (expectedCurrency.trim().toUpperCase() !== actualCurrency.trim().toUpperCase()) {
    throw new Error('CURRENCY_MISMATCH');
  }
}

type BkashToken = { token: string; expiresAt: number };
type BkashConfig = { baseUrl: string; appKey: string; appSecret: string; username: string; password: string; callbackUrl: string };

let cachedToken: BkashToken | undefined;
let tokenPromise: Promise<string> | undefined;

function config(): BkashConfig {
  const required = ['BKASH_BASE_URL', 'BKASH_APP_KEY', 'BKASH_APP_SECRET', 'BKASH_USERNAME', 'BKASH_PASSWORD', 'BKASH_CALLBACK_URL'] as const;
  for (const key of required) if (!process.env[key]) throw new Error(`${key} is not configured`);
  return { baseUrl: process.env.BKASH_BASE_URL!.replace(/\/$/, ''), appKey: process.env.BKASH_APP_KEY!, appSecret: process.env.BKASH_APP_SECRET!, username: process.env.BKASH_USERNAME!, password: process.env.BKASH_PASSWORD!, callbackUrl: process.env.BKASH_CALLBACK_URL! };
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
async function request<T>(url: string, init: RequestInit): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      const text = await response.text();
      let body: unknown;
      try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
      if (response.ok) return body as T;
      const error = new Error(`bKash HTTP ${response.status}: ${text.slice(0, 500)}`);
      if (!RETRYABLE.has(response.status) || attempt === 2) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('bKash request failed');
}

async function fetchToken(): Promise<string> {
  const cfg = config();
  const body = await request<{ id_token?: string; expires_in?: number }>(`${cfg.baseUrl}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', username: cfg.username, password: cfg.password, 'X-App-Key': cfg.appKey },
    body: JSON.stringify({ app_key: cfg.appKey, app_secret: cfg.appSecret }),
  });
  if (!body.id_token) throw new Error('bKash token response did not contain id_token');
  cachedToken = { token: body.id_token, expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 };
  return cachedToken.token;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  if (tokenPromise) return tokenPromise;
  tokenPromise = fetchToken().finally(() => { tokenPromise = undefined; });
  return tokenPromise;
}

export async function createBkashPayment(input: { amount: string; invoice: string; payerReference?: string }) {
  const cfg = config();
  const token = await getToken();
  return request<{ paymentID?: string; bkashURL?: string; statusCode?: string; statusMessage?: string }>(`${cfg.baseUrl}/tokenized/checkout/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: token, 'X-App-Key': cfg.appKey },
    body: JSON.stringify({ mode: '0011', payerReference: input.payerReference ?? input.invoice, callbackURL: cfg.callbackUrl, amount: input.amount, currency: 'BDT', intent: 'sale', merchantInvoiceNumber: input.invoice }),
  });
}

export async function executeBkashPayment(paymentID: string) {
  const cfg = config();
  const token = await getToken();
  return request<{ paymentID?: string; transactionStatus?: string; trxID?: string; amount?: string; currency?: string; statusCode?: string; statusMessage?: string }>(`${cfg.baseUrl}/tokenized/checkout/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: token, 'X-App-Key': cfg.appKey },
    body: JSON.stringify({ paymentID }),
  });
}

export async function queryBkashPayment(paymentID: string) {
  const cfg = config();
  const token = await getToken();
  return request<{ paymentID?: string; transactionStatus?: string; trxID?: string; amount?: string; currency?: string; statusCode?: string; statusMessage?: string }>(`${cfg.baseUrl}/tokenized/checkout/payment/status/${encodeURIComponent(paymentID)}`, {
    method: 'GET', headers: { Accept: 'application/json', Authorization: token, 'X-App-Key': cfg.appKey },
  });
}

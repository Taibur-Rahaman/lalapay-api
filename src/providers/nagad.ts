import { createHash, createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt, randomBytes, createSign, createVerify } from 'node:crypto';

type NagadConfig = {
  baseUrl: string;
  merchantId: string;
  merchantNumber?: string;
  merchantPrivateKey: string;
  pgPublicKey: string;
  callbackUrl: string;
  currencyCode: string;
};

type NagadResponse = Record<string, unknown>;

function normalizeKey(value: string, type: 'private' | 'public') {
  const trimmed = value.trim();
  if (trimmed.includes('BEGIN')) return trimmed;
  const label = type === 'private' ? 'PRIVATE KEY' : 'PUBLIC KEY';
  const body = trimmed.replace(/\s+/g, '');
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)?.join('\n') ?? body}\n-----END ${label}-----`;
}

function config(): NagadConfig {
  const required = ['NAGAD_BASE_URL', 'NAGAD_MERCHANT_ID', 'NAGAD_MERCHANT_PRIVATE_KEY', 'NAGAD_PG_PUBLIC_KEY', 'NAGAD_CALLBACK_URL'] as const;
  for (const key of required) if (!process.env[key]) throw new Error(`${key} is not configured`);
  return {
    baseUrl: process.env.NAGAD_BASE_URL!.replace(/\/$/, ''), merchantId: process.env.NAGAD_MERCHANT_ID!, merchantNumber: process.env.NAGAD_MERCHANT_NUMBER || undefined,
    merchantPrivateKey: process.env.NAGAD_MERCHANT_PRIVATE_KEY!, pgPublicKey: process.env.NAGAD_PG_PUBLIC_KEY!, callbackUrl: process.env.NAGAD_CALLBACK_URL!, currencyCode: process.env.NAGAD_CURRENCY_CODE || '050',
  };
}
function encryptForNagad(value: string, publicKey: string) { return publicEncrypt({ key: createPublicKey(normalizeKey(publicKey, 'public')), padding: 4 }, Buffer.from(value, 'utf8')).toString('base64'); }
function decryptFromNagad(value: string, privateKey: string) { return privateDecrypt({ key: createPrivateKey(normalizeKey(privateKey, 'private')), padding: 4 }, Buffer.from(value, 'base64')).toString('utf8'); }
function signForNagad(value: string, privateKey: string) { const signer = createSign('RSA-SHA1'); signer.update(value, 'utf8'); signer.end(); return signer.sign(createPrivateKey(normalizeKey(privateKey, 'private'))).toString('base64'); }
function verifyNagadSignature(value: string, signature: string, publicKey: string) { const verifier = createVerify('RSA-SHA1'); verifier.update(value, 'utf8'); verifier.end(); return verifier.verify(createPublicKey(normalizeKey(publicKey, 'public')), Buffer.from(signature, 'base64')); }

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
async function request<T>(url: string, init: RequestInit): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      const text = await response.text(); let body: unknown;
      try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
      if (response.ok) return body as T;
      const error = new Error(`Nagad HTTP ${response.status}: ${text.slice(0, 500)}`);
      if (!RETRYABLE.has(response.status) || attempt === 2) throw error;
      lastError = error;
    } catch (error) { lastError = error; if (attempt === 2) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('Nagad request failed');
}
function nowDhaka() { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''; return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`; }
function orderId(transactionId: string) { return `LP${transactionId.replace(/-/g, '').slice(0, 18)}`; }
export async function createNagadPayment(input: { amount: string; invoice: string }) {
  const cfg = config(); const oid = orderId(input.invoice); const initPlain = JSON.stringify({ merchantId: cfg.merchantId, datetime: nowDhaka(), orderId: oid, challenge: randomBytes(20).toString('hex').toUpperCase() });
  const init = await request<NagadResponse>(`${cfg.baseUrl}/check-out/initialize/${encodeURIComponent(cfg.merchantId)}/${encodeURIComponent(oid)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ accountNumber: cfg.merchantNumber, dateTime: nowDhaka(), sensitiveData: encryptForNagad(initPlain, cfg.pgPublicKey), signature: signForNagad(initPlain, cfg.merchantPrivateKey) }) });
  if (!init.sensitiveData || !init.signature) throw new Error(String(init.message ?? 'Invalid Nagad initialize response'));
  const decrypted = decryptFromNagad(String(init.sensitiveData), cfg.merchantPrivateKey); if (!verifyNagadSignature(decrypted, String(init.signature), cfg.pgPublicKey)) throw new Error('Nagad initialize response signature verification failed');
  const session = JSON.parse(decrypted) as { paymentReferenceId?: string; challenge?: string }; if (!session.paymentReferenceId || !session.challenge) throw new Error('Nagad initialize response missing paymentReferenceId');
  const orderPlain = JSON.stringify({ merchantId: cfg.merchantId, orderId: oid, currencyCode: cfg.currencyCode, amount: input.amount, challenge: session.challenge });
  const complete = await request<NagadResponse>(`${cfg.baseUrl}/check-out/complete/${encodeURIComponent(session.paymentReferenceId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ sensitiveData: encryptForNagad(orderPlain, cfg.pgPublicKey), signature: signForNagad(orderPlain, cfg.merchantPrivateKey), merchantCallbackURL: cfg.callbackUrl }) });
  if (String(complete.status).toLowerCase() !== 'success' || !complete.callBackUrl) throw new Error(String(complete.message ?? complete.reason ?? 'Nagad checkout initialization failed'));
  return { orderId: oid, paymentReferenceId: String(session.paymentReferenceId), redirectUrl: String(complete.callBackUrl) };
}
export async function verifyNagadPayment(paymentReferenceId: string) { const cfg = config(); return request<NagadResponse>(`${cfg.baseUrl}/verify/payment/${encodeURIComponent(paymentReferenceId)}`, { method: 'GET', headers: { Accept: 'application/json' } }); }
export function isNagadSuccess(status: unknown) { return String(status ?? '').toLowerCase() === 'success'; }
export function hashCallbackValue(value: string) { return createHash('sha256').update(value).digest('hex'); }

import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
  return value;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = (await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })) as Buffer;
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [, salt, expected] = encoded.split('$');
  if (!salt || !expected) return false;
  const actual = await hashPassword(password, salt);
  const a = Buffer.from(actual.split('$')[2], 'base64url');
  const b = Buffer.from(expected, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createPasswordHash(password: string) {
  return hashPassword(password);
}

export function createAuthToken(merchantId: string) {
  const payload = base64url(JSON.stringify({ sub: merchantId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }));
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAuthToken(token: string) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
    if (!data.sub || !data.exp || data.exp <= Math.floor(Date.now() / 1000)) return null;
    return { merchantId: data.sub, expiresAt: data.exp };
  } catch {
    return null;
  }
}

export function getBearerToken(request: any) {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return null;
  return value.slice(7).trim();
}

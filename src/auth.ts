import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_TOKEN_LENGTH = 4096;
const MAX_PASSWORD_LENGTH = 200;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
  return value;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error('Password is too long');
  const derived = (await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 })) as Buffer;
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  if (password.length > MAX_PASSWORD_LENGTH || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  if (!salt || !expected || !/^[a-f0-9]{32}$/.test(salt)) return false;
  try {
    const actualEncoded = await hashPassword(password, salt);
    const actual = Buffer.from(actualEncoded.split('$')[2], 'base64url');
    const expectedBytes = Buffer.from(expected, 'base64url');
    return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
  } catch {
    return false;
  }
}

export async function createPasswordHash(password: string) {
  return hashPassword(password);
}

export function createAuthToken(merchantId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(merchantId)) throw new Error('Invalid merchant id');
  const payload = base64url(JSON.stringify({ sub: merchantId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }));
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAuthToken(token: string) {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || token.split('.').length !== 2) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
    if (!data.sub || !/^[0-9a-f-]{36}$/i.test(data.sub) || !Number.isSafeInteger(data.exp) || data.exp <= Math.floor(Date.now() / 1000)) return null;
    return { merchantId: data.sub, expiresAt: data.exp };
  } catch {
    return null;
  }
}

export function getBearerToken(request: any) {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !/^Bearer\s+\S+$/.test(value) || value.length > MAX_TOKEN_LENGTH + 7) return null;
  return value.slice(7).trim();
}

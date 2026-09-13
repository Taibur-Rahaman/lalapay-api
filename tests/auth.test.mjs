import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'lalapay-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';

const { createAuthToken, verifyAuthToken, getBearerToken, createPasswordHash, verifyPassword } = await import('../dist/auth.js');

const merchantId = '123e4567-e89b-12d3-a456-426614174000';

test('auth token round-trips for a valid merchant id', () => {
  const token = createAuthToken(merchantId);
  const verified = verifyAuthToken(token);
  assert.equal(verified?.merchantId, merchantId);
  assert.equal(typeof verified?.expiresAt, 'number');
});

test('auth token rejects malformed and tampered values', () => {
  const token = createAuthToken(merchantId);
  assert.equal(verifyAuthToken(''), null);
  assert.equal(verifyAuthToken('not-a-token'), null);
  assert.equal(verifyAuthToken(`${token}x`), null);
  assert.equal(verifyAuthToken(`${token.split('.')[0]}.invalid`), null);
});

test('bearer parser accepts a normal authorization header', () => {
  const token = createAuthToken(merchantId);
  assert.equal(getBearerToken({ headers: { authorization: `Bearer ${token}` } }), token);
  assert.equal(getBearerToken({ headers: {} }), null);
  assert.equal(getBearerToken({ headers: { authorization: 'Basic abc' } }), null);
});

test('password hashes verify without storing the password directly', async () => {
  const password = 'Correct-Horse-Battery-9!';
  const hash = await createPasswordHash(password);
  assert.match(hash, /^scrypt\$/);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('password verification safely rejects malformed hashes', async () => {
  assert.equal(await verifyPassword('password', 'bad-hash'), false);
  assert.equal(await verifyPassword('password', 'scrypt$$bad'), false);
  assert.equal(await verifyPassword('password', 'scrypt$not-a-valid-salt$abc'), false);
});

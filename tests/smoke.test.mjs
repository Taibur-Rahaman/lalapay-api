import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.NODE_ENV = 'test';

const { app } = await import('../src/server.js');

test('liveness health does not require database', async () => {
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'lalapay-api');
});

test('unknown route returns JSON 404', async () => {
  const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().success, false);
});

test('protected route rejects missing authentication', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/payment-links' });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, 'Authentication required');
});

test('payment initiation rejects missing idempotency key', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/v1/payment-links/invalid-id/pay/bkash' });
  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /Idempotency-Key/);
});

after(async () => {
  await app.close();
});

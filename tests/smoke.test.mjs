import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL='1';
process.env.NODE_ENV='test';

const {app}=await import('../dist/server.js');

test('liveness health does not require database',async()=>{const r=await app.inject({method:'GET',url:'/health'});assert.equal(r.statusCode,200);const b=r.json();assert.equal(b.status,'ok');assert.equal(b.service,'lalapay-api');assert.equal(b.version,'0.10.0')});
test('unknown route returns JSON 404',async()=>{const r=await app.inject({method:'GET',url:'/does-not-exist'});assert.equal(r.statusCode,404);assert.equal(r.json().success,false)});
test('protected route rejects missing authentication',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/payment-links'});assert.equal(r.statusCode,401);assert.equal(r.json().message,'Authentication required')});
test('auth me rejects missing authentication',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/auth/me'});assert.equal(r.statusCode,401)});
test('payment initiation rejects missing idempotency key',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/payment-links/invalid-id/pay/bkash'});assert.equal(r.statusCode,400);assert.match(r.json().message,/Idempotency-Key/)});
test('payment initiation rejects oversized idempotency key',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/payment-links/invalid-id/pay/bkash',headers:{'Idempotency-Key':'x'.repeat(151)}});assert.equal(r.statusCode,400)});
test('invalid public payment-link id is rejected before database access',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/payment-links/a'});assert.equal(r.statusCode,400);assert.equal(r.json().success,false)});
test('invalid transaction id is rejected before database access',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/payments/not-a-uuid'});assert.equal(r.statusCode,400);assert.equal(r.json().success,false)});
test('invalid merchant transaction pagination is protected before validation',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/merchant/transactions?limit=0'});assert.equal(r.statusCode,401);assert.equal(r.json().message,'Authentication required')});
test('bKash callback rejects malformed query',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/payments/bkash/callback?paymentID='});assert.equal(r.statusCode,400)});
test('Nagad callback rejects malformed query',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/payments/nagad/callback?payment_ref_id='});assert.equal(r.statusCode,400)});
test('readiness endpoint reports unavailable database instead of crashing',async()=>{const r=await app.inject({method:'GET',url:'/health/ready'});assert.equal(r.statusCode,503);assert.equal(r.headers['content-type'].includes('application/json'),true);assert.equal(r.json().status,'not_ready')});
after(async()=>{await app.close()});

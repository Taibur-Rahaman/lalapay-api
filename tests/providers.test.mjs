import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BKASH_BASE_URL='https://mock-bkash.test';
process.env.BKASH_APP_KEY='app-key';
process.env.BKASH_APP_SECRET='app-secret';
process.env.BKASH_USERNAME='user';
process.env.BKASH_PASSWORD='pass';
process.env.BKASH_CALLBACK_URL='https://lalapay-api.vercel.app/api/v1/payments/bkash/callback';

test('bKash provider mock creates a checkout without real gateway access', async () => {
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (url,init={})=>{calls.push({url:String(url),init});if(String(url).endsWith('/tokenized/checkout/token/grant'))return new Response(JSON.stringify({id_token:'mock-token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});if(String(url).endsWith('/tokenized/checkout/create'))return new Response(JSON.stringify({paymentID:'MOCK-PAYMENT',bkashURL:'https://mock-bkash.test/checkout'}),{status:200,headers:{'content-type':'application/json'}});throw new Error(`Unexpected mock URL: ${url}`)};
  try { const {createBkashPayment}=await import('../src/providers/bkash.js');const result=await createBkashPayment({amount:'125.00',invoice:'invoice-1'});assert.equal(result.paymentID,'MOCK-PAYMENT');assert.equal(result.bkashURL,'https://mock-bkash.test/checkout');assert.equal(calls.length,2);assert.match(calls[1].init.body,/125\.00/); } finally { globalThis.fetch=originalFetch; }
});

test('bKash provider surfaces gateway HTTP failures', async () => {
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('gateway down',{status:502});
  try { const {createBkashPayment}=await import('../src/providers/bkash.js');await assert.rejects(()=>createBkashPayment({amount:'10.00',invoice:'invoice-2'}),/bKash HTTP 502/); } finally { globalThis.fetch=originalFetch; }
});

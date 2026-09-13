import { runReconciliation } from '../src/reconciliation.js';

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET' && request.method !== 'POST') { response.statusCode=405; response.end('Method Not Allowed'); return; }
  const expected=process.env.CRON_SECRET;
  const auth=String(request.headers?.authorization??'');
  if(!expected || auth!==`Bearer ${expected}`){ response.statusCode=401; response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({success:false,message:'Unauthorized'})); return; }
  try { const result=await runReconciliation(100); response.statusCode=200; response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({success:true,data:result})); }
  catch(error){ console.error('reconciliation failed',error); response.statusCode=503; response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({success:false,message:'Reconciliation failed'})); }
}

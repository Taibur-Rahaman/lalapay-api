import { ensureDatabase, getPool } from './db.js';
import { queryBkashPayment } from './providers/bkash.js';
import { verifyNagadPayment, isNagadSuccess } from './providers/nagad.js';

function moneyEquals(actual: unknown, expected: unknown) { const a=Number(actual), e=Number(expected); return Number.isFinite(a)&&Number.isFinite(e)&&a.toFixed(2)===e.toFixed(2); }
function currencyEquals(actual: unknown, expected: unknown) { return typeof actual==='string' && actual.trim().toUpperCase()===String(expected).trim().toUpperCase(); }
function providerState(provider: string, result: any) {
  if (provider==='bkash') {
    if ((result.transactionStatus==='Completed'||result.statusCode==='0000')) return 'SUCCESS';
    if (['Initiated','Pending'].includes(String(result.transactionStatus))) return 'PENDING';
    return 'FAILED';
  }
  if (isNagadSuccess(result.status)) return 'SUCCESS';
  if (['OrderInitiated','Ready','InProgress','OtpSent','OtpVerified','PinGiven'].includes(String(result.status))) return 'PENDING';
  return 'FAILED';
}

export async function runReconciliation(limit=50) {
  await ensureDatabase();
  const db=getPool();
  const run=(await db.query('INSERT INTO reconciliation_runs DEFAULT VALUES RETURNING id')).rows[0].id as string;
  let checked=0,recovered=0,failed=0,errors=0;
  const rows=(await db.query(`SELECT t.* FROM transactions t WHERE t.status IN ('INITIATED','PENDING') AND t.provider_payment_id IS NOT NULL AND t.updated_at < NOW()-INTERVAL '2 minutes' AND t.updated_at > NOW()-INTERVAL '24 hours' ORDER BY t.updated_at ASC LIMIT $1`,[Math.min(200,Math.max(1,limit))])).rows;
  for(const tx of rows){
    checked++;
    try{
      const result:any=tx.provider==='bkash'?await queryBkashPayment(String(tx.provider_payment_id)):await verifyNagadPayment(String(tx.provider_payment_id));
      const amountOk=moneyEquals(result.amount,tx.amount); const currencyOk=currencyEquals(result.currency,tx.currency); const state=providerState(tx.provider,result);
      let next=state;
      if(state==='SUCCESS'&&!amountOk){ next='FAILED'; await db.query(`INSERT INTO reconciliation_mismatches(run_id,transaction_id,provider,local_status,provider_status,mismatch_type,details) VALUES($1,$2,$3,$4,$5,'AMOUNT_MISMATCH',$6)`,[run,tx.id,tx.provider,tx.status,String(result.transactionStatus??result.status??''),JSON.stringify({expected:String(tx.amount),actual:String(result.amount)})]); }
      else if(state==='SUCCESS'&&!currencyOk){ next='FAILED'; await db.query(`INSERT INTO reconciliation_mismatches(run_id,transaction_id,provider,local_status,provider_status,mismatch_type,details) VALUES($1,$2,$3,$4,$5,'CURRENCY_MISMATCH',$6)`,[run,tx.id,tx.provider,tx.status,String(result.transactionStatus??result.status??''),JSON.stringify({expected:tx.currency,actual:result.currency})]); }
      const providerTx=tx.provider==='bkash'?(result.trxID??null):(result.issuerPaymentRefNo??null);
      const updated=await db.query(`UPDATE transactions SET status=$1,provider_transaction_id=COALESCE($2,provider_transaction_id),updated_at=NOW(),completed_at=CASE WHEN $1='SUCCESS' THEN COALESCE(completed_at,NOW()) ELSE completed_at END WHERE id=$3 AND status<>'SUCCESS' RETURNING id,status`,[next,providerTx,tx.id]);
      if(updated.rowCount){ if(next==='SUCCESS') recovered++; else if(next==='FAILED') failed++; }
    }catch(error){ errors++; await db.query(`INSERT INTO reconciliation_mismatches(run_id,transaction_id,provider,local_status,provider_status,mismatch_type,details) VALUES($1,$2,$3,$4,NULL,'PROVIDER_QUERY_ERROR',$5)`,[run,tx.id,tx.provider,tx.status,JSON.stringify({message:error instanceof Error?error.message:'unknown'})]); }
  }
  await db.query('UPDATE reconciliation_runs SET finished_at=NOW(),checked_count=$1,recovered_count=$2,failed_count=$3,error_count=$4 WHERE id=$5',[checked,recovered,failed,errors,run]);
  return {runId:run,checked,recovered,failed,errors};
}

import { createHash } from 'node:crypto';
import { ensureDatabase, getPool } from '../src/db.js';
import { ensureMerchantPlatform, handleMerchantPlatform, handleAdminRoute } from '../src/merchant-platform.js';
import { getCookie, verifyAuthToken, SESSION_COOKIE, CSRF_COOKIE } from '../src/auth.js';

const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
function json(res:any,status:number,data:any){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}
function requestPath(req:any){return String(req.headers?.['x-vercel-original-url']||req.headers?.['x-original-url']||req.headers?.['x-matched-path']||req.url||'').split('?')[0];}
async function merchantSession(req:any){
  const token=getCookie(req,SESSION_COOKIE); if(!token) return null;
  const auth=verifyAuthToken(token); if(!auth) return null;
  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','HEAD','OPTIONS'].includes(method)){
    const cookie=getCookie(req,CSRF_COOKIE); const header=String(req.headers?.['x-csrf-token']||'');
    if(!cookie||cookie.length!==64||cookie!==header)return {invalidCsrf:true};
  }
  const r=await getPool().query(`SELECT s.id,s.merchant_id,s.expires_at,m.status,m.name,m.email,m.email_verified_at FROM auth_sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1`,[hash(token)]);
  if(!r.rowCount||r.rows[0].status!=='ACTIVE')return null;
  return {token,auth,session:r.rows[0]};
}
export default async function handler(req:any,res:any){
  try{
    await ensureDatabase(); await ensureMerchantPlatform();
    const path=requestPath(req);
    if(path.startsWith('/api/v1/admin/')){
      if(await handleAdminRoute(req,res))return;
      return json(res,401,{success:false,message:'Admin authentication required'});
    }
    const session=await merchantSession(req);
    if((session as any)?.invalidCsrf)return json(res,403,{success:false,message:'CSRF validation failed'});
    if(!session)return json(res,401,{success:false,message:'Authentication required'});
    if(await handleMerchantPlatform(req,res,session))return;
    return json(res,404,{success:false,message:'Merchant platform route not found'});
  }catch(error){
    console.error('merchant platform request failed',error instanceof Error?error.message:'unknown error');
    if(!res.headersSent)json(res,500,{success:false,message:'Internal server error'});
  }
}

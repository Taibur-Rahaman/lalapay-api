import { whmcsPaymentStatus } from '../src/integrations/whmcs-handler.js';
export default async function handler(request:any,response:any){ return whmcsPaymentStatus(request,response); }

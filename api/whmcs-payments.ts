import { whmcsCreatePayment } from '../src/integrations/whmcs-handler.js';
export default async function handler(request:any,response:any){ return whmcsCreatePayment(request,response); }

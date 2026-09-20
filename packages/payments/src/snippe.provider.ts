import {createHmac,timingSafeEqual} from 'node:crypto';
import {Problem} from '../../database/src/index.ts';
import type {CheckoutInput,CheckoutResult,NormalizedEvent,PaymentProvider,PaymentStatus} from './provider.ts';

// Snippe adapter (https://docs.snippe.sh). Hosted Payment Sessions, so this
// service never sees a card number or a mobile-money PIN -- the buyer enters
// those on Snippe's page. Ported from the Pastatrade gateway.

const PAID=new Set(['completed','paid','success','successful','succeeded']);
const FAILED=new Set(['failed','cancelled','canceled','expired','declined','reversed']);
const base=()=>(process.env.SNIPPE_BASE_URL||'https://api.snippe.sh').replace(/\/+$/,'');

interface SessionResponse {code?:number;message?:string;error?:string;data?:{reference?:string;checkout_url?:string;status?:string;message?:string}}
interface SnippeEvent {id?:string;type?:string;data?:{reference?:string;status?:string;amount?:{value?:number;currency?:string};metadata?:Record<string,unknown>;failure_reason?:string;failure_code?:string}}

export const snippeProvider:PaymentProvider={
 name:'snippe',

 async createCheckout(input:CheckoutInput):Promise<CheckoutResult>{
  const amount=Math.round(input.amount);
  // Snippe's floor is 500 TZS. Surface it here rather than as a raw provider error.
  if(amount<500)throw new Problem(400,'This package is priced below the 500 TZS minimum for mobile payment. Please pay the attendant instead.');
  const payload:Record<string,unknown>={
   amount,currency:input.currency,description:input.description,reference:input.reference,
   customer:{name:input.customer.name,email:input.customer.email,phone:input.customer.phone},
   // Echoed back on every event. Snippe quotes a transaction reference (SN…) on
   // webhooks, not the session reference (PAY…) it returns here and not the
   // `reference` above, so metadata is the only dependable way back to our row.
   metadata:{intent_reference:input.reference},
   redirect_url:input.returnUrl,expires_in:900
  };
  // Snippe rejects non-public webhook URLs; in local development fall back to
  // the URL configured in the Snippe dashboard.
  if(input.webhookUrl.startsWith('https://'))payload.webhook_url=input.webhookUrl;
  let response:Response,text='';
  try{
   response=await fetch(base()+'/api/v1/sessions',{method:'POST',headers:{Authorization:'Bearer '+(process.env.SNIPPE_API_KEY||''),'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   text=await response.text();
  }catch{throw new Problem(502,'Could not reach the payment service. Please try again or pay the attendant.');}
  let json:SessionResponse={};
  try{json=text?JSON.parse(text) as SessionResponse:{};}catch{/* non-JSON body */}
  // Never echo the provider's raw message to the buyer: it can carry account detail.
  if(!response.ok||!json.data?.checkout_url)throw new Problem(502,'The payment service could not start this purchase. Please try again or pay the attendant.');
  return {provider:'snippe',reference:json.data.reference||input.reference,checkout_url:json.data.checkout_url};
 },

 verifyWebhook(rawBody,headers){
  const signature=headers['x-webhook-signature'],timestamp=headers['x-webhook-timestamp'],secret=process.env.SNIPPE_WEBHOOK_SECRET||'';
  if(!secret||!signature||!timestamp)return false;
  // Replay protection: reject anything older than five minutes.
  const ts=Number(timestamp);if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>300)return false;
  const body=Buffer.isBuffer(rawBody)?rawBody.toString('utf8'):String(rawBody);
  const expected=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
  const a=Buffer.from(signature,'utf8'),b=Buffer.from(expected,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
 },

 parseEvent(body:unknown):NormalizedEvent{
  const e=(body||{}) as SnippeEvent;
  // Without an event id there is no idempotency key, and a retry would be
  // indistinguishable from a second payment. Refuse rather than guess.
  if(!e.id)throw new Problem(400,'Event is missing an identifier');
  if(!e.data?.reference)throw new Problem(400,'Event is missing a reference');
  const own=e.data.metadata?.intent_reference;
  return {id:e.id,type:e.type||'unknown',status:(e.data.status||'').toLowerCase(),reference:e.data.reference,
   ownReference:typeof own==='string'&&own?own:null,
   amount:e.data.amount?.value??null,currency:e.data.amount?.currency??null,
   failureReason:e.data.failure_reason||e.data.failure_code||null,raw:body};
 },

 isPaid(status:string){return PAID.has(status.toLowerCase());},

 async fetchStatus(reference:string):Promise<PaymentStatus|null>{
  if(!reference)return null;
  try{
   const response=await fetch(base()+'/api/v1/sessions/'+encodeURIComponent(reference),{headers:{Authorization:'Bearer '+(process.env.SNIPPE_API_KEY||''),accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)return null;
   const json=await response.json() as {data?:{status?:string}};
   const status=(json.data?.status||'').toLowerCase();
   return {reference,status,paid:PAID.has(status)};
  }catch{return null;}
 }
};

export const isFailure=(status:string)=>FAILED.has(status.toLowerCase());

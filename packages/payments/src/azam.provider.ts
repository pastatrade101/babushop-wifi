import {createHash,timingSafeEqual} from 'node:crypto';
import {Problem} from '../../database/src/index.ts';
import type {CheckoutInput,CheckoutResult,NormalizedEvent,PaymentProvider,PaymentStatus,Network} from './provider.ts';

// AzamPay adapter. Mobile-money checkout: the buyer stays on our page and the
// network pushes a PIN prompt to their handset, so we collect the number and the
// network ourselves and never see a PIN.
//
// Two things about this provider shape the code below.
//
// It does not sign its callbacks. There is no HMAC to check, so the callback URL
// carries an unguessable secret path segment and the same secret is accepted as a
// bearer token; `confirmsOutOfBand` is true so a voucher is never released on the
// say-so of an unauthenticated POST alone.
//
// Its callback field names vary by network and by API version -- the same value
// arrives as `utilityref`, `externalId` or `externalReference` depending on who
// is sending it. Every known alias is read rather than assuming one shape.

const PAID=['success','successful','completed','paid'];
const FAILED=['fail','failed','cancel','cancelled','canceled','expired','declined','reversed','insufficient','timeout'];

const authBase=()=>(process.env.AZAM_AUTH_URL||'https://authenticator.azampay.co.tz').replace(/\/+$/,'');
const apiBase=()=>(process.env.AZAM_BASE_URL||'https://checkout.azampay.co.tz').replace(/\/+$/,'');

/** AzamPay's own spelling for each network. The buyer never sees these. */
const PROVIDERS:Record<string,string>={vodacom:'Mpesa',airtel:'Airtel',tigo:'Tigo',halopesa:'Halopesa',azampesa:'Azampesa'};
export const AZAM_NETWORKS:Network[]=[
 {value:'vodacom',label:'M-Pesa (Vodacom)'},
 {value:'airtel',label:'Airtel Money'},
 {value:'tigo',label:'Mixx by Yas (Tigo Pesa)'},
 {value:'halopesa',label:'HaloPesa'},
 {value:'azampesa',label:'Azam Pesa'},
];

/**
 * Tanzanian mobile numbers, normalised to the 2557XXXXXXXX form AzamPay expects.
 * Accepts 07…, 7…, +2557… and 2557…; rejects anything else rather than sending
 * a number the network will silently fail to reach.
 */
export function normalizePhone(value:string):string{
 const digits=(value||'').replace(/\D/g,'');
 const local=digits.startsWith('255')?digits.slice(3):digits.startsWith('0')?digits.slice(1):digits;
 if(!/^[67]\d{8}$/.test(local))throw new Problem(400,'Enter a valid Tanzanian mobile number, for example 0712 345 678.');
 return '255'+local;
}

let cached:{token:string;expires:number}|null=null;

/** Bearer token, cached until a minute before it expires. */
async function accessToken():Promise<string>{
 if(cached&&cached.expires>Date.now())return cached.token;
 const appName=process.env.AZAM_APP_NAME||'',clientId=process.env.AZAM_CLIENT_ID||'',clientSecret=process.env.AZAM_CLIENT_SECRET||'';
 if(!appName||!clientId||!clientSecret)throw new Problem(503,'Mobile payment is not configured.');
 let response:Response,text='';
 try{
  response=await fetch(authBase()+'/AppRegistration/GenerateToken',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName,clientId,clientSecret}),signal:AbortSignal.timeout(15000)});
  text=await response.text();
 }catch{throw new Problem(502,'Could not reach the payment service. Please try again or pay the attendant.');}
 let json:{data?:{accessToken?:string;expire?:string}}={};
 try{json=text?JSON.parse(text):{};}catch{/* non-JSON body */}
 const token=json.data?.accessToken;
 if(!response.ok||!token)throw new Problem(502,'The payment service could not be reached. Please try again or pay the attendant.');
 const expiry=json.data?.expire?Date.parse(json.data.expire):NaN;
 cached={token,expires:Number.isFinite(expiry)?expiry-60000:Date.now()+3300000};
 return token;
}

/** Test seam: a failed call must not leave a stale token behind. */
export function resetToken(){cached=null;}

interface CheckoutResponse {success?:boolean;transactionId?:string;message?:string;data?:{transactionId?:string}}
type Callback=Record<string,unknown>;
const first=(body:Callback,...names:string[]):string|null=>{
 for(const name of names){const value=body[name];if(typeof value==='string'&&value)return value;if(typeof value==='number')return String(value);}
 return null;
};

export const azamProvider:PaymentProvider={
 name:'azam',
 flow:'push',
 networks:AZAM_NETWORKS,
 confirmsOutOfBand:true,

 async createCheckout(input:CheckoutInput):Promise<CheckoutResult>{
  const amount=Math.round(input.amount);
  if(amount<1)throw new Problem(400,'This package cannot be paid for by phone. Please pay the attendant.');
  const network=PROVIDERS[(input.network||'').toLowerCase()];
  if(!network)throw new Problem(400,'Choose your mobile money network.');
  if(!input.customer.phone)throw new Problem(400,'Enter the number that will pay.');
  const accountNumber=normalizePhone(input.customer.phone);
  const token=await accessToken();
  const payload={
   accountNumber,amount:String(amount),currency:input.currency,
   externalId:input.reference,provider:network,
   // Echoed back on the callback, and the dependable way home when the network
   // rewrites externalId into one of its own reference fields.
   additionalProperties:{source:'jiachie',intent_reference:input.reference},
  };
  let response:Response,text='';
  try{
   response=await fetch(apiBase()+'/azampay/mno/checkout',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
   text=await response.text();
  }catch{throw new Problem(502,'Could not reach the payment service. Please try again or pay the attendant.');}
  // A rejected token is worth one retry with a fresh one; anything else is not.
  if(response.status===401){resetToken();throw new Problem(502,'The payment service rejected this request. Please try again or pay the attendant.');}
  let json:CheckoutResponse={};
  try{json=text?JSON.parse(text):{};}catch{/* non-JSON body */}
  const reference=json.transactionId||json.data?.transactionId||null;
  // Never echo the provider's own message: it can carry account detail.
  if(!response.ok||json.success===false||!reference)throw new Problem(502,'The payment service could not start this purchase. Please try again or pay the attendant.');
  return {provider:'azam',reference,checkout_url:null,flow:'push',
   instruction:'Check your phone. Enter your mobile money PIN to approve the payment.'};
 },

 /**
  * AzamPay does not sign callbacks, so this is a shared-secret check, not a
  * signature check. The secret arrives either as the last path segment of the
  * callback URL or as a bearer token, and is compared in constant time.
  * `confirmsOutOfBand` is what actually protects the voucher.
  */
 verifyWebhook(_rawBody,headers){
  const secret=process.env.AZAM_CALLBACK_TOKEN||'';
  if(!secret)return false;
  const presented=headers['x-callback-token']||headers.authorization?.replace(/^Bearer\s+/i,'')||'';
  if(!presented)return false;
  // Hash both sides so the comparison is over equal lengths whatever is sent.
  const a=createHash('sha256').update(presented).digest(),b=createHash('sha256').update(secret).digest();
  return timingSafeEqual(a,b);
 },

 parseEvent(body:unknown):NormalizedEvent{
  const e=(body||{}) as Callback;
  const additional=(e.additionalProperties||{}) as Callback;
  const reference=first(e,'transid','transactionId','transaction_id','pgReferenceId','reference','mnoreference','mnoReference','fspReferenceId');
  if(!reference)throw new Problem(400,'Callback is missing a transaction reference');
  const own=first(additional,'intent_reference')||first(e,'utilityref','utilityRef','externalId','external_id','externalID','externalreference','externalReference','external_reference');
  const status=(first(e,'transactionstatus','transactionStatus','status','statusCode','message')||'').toLowerCase();
  const amount=Number(first(e,'amount','Amount'));
  // No event id of its own, so the transaction reference plus its reported
  // status is the idempotency key: a retry of the same outcome collapses, while
  // a genuine change of state is still recorded.
  return {id:`${reference}:${status||'unknown'}`,type:'mno.checkout',status,reference,
   ownReference:own,amount:Number.isFinite(amount)?amount:null,
   currency:first(e,'currency')||null,
   failureReason:first(e,'message','description','statusDescription','status_description'),raw:body};
 },

 isPaid(status:string){const s=status.toLowerCase();return PAID.some(word=>s.includes(word))&&!FAILED.some(word=>s.includes(word));},

 isFailure(status:string){return isAzamFailure(status);},

 /**
  * Confirmation, and the only thing a voucher is released on. Returns null on
  * any doubt, which callers must treat as "not paid" rather than "not known".
  */
 async fetchStatus(reference:string):Promise<PaymentStatus|null>{
  if(!reference)return null;
  const bank=process.env.AZAM_STATUS_BANK||'';
  if(!bank)return null;            // unconfigured: never guess a payment is good
  try{
   const token=await accessToken();
   const url=new URL(apiBase()+'/azampay/gateway/transaction-status');
   url.searchParams.set('pgReferenceId',reference);
   url.searchParams.set('bankName',bank);
   const response=await fetch(url,{headers:{Authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)return null;
   const json=await response.json() as {data?:{transactionStatus?:string};transactionStatus?:string;status?:string};
   const status=(json.data?.transactionStatus||json.transactionStatus||json.status||'').toLowerCase();
   if(!status)return null;
   return {reference,status,paid:azamProvider.isPaid(status)};
  }catch{return null;}
 }
};

export const isAzamFailure=(status:string)=>{const s=status.toLowerCase();return FAILED.some(word=>s.includes(word));};

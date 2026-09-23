import {createHash,createVerify,timingSafeEqual} from 'node:crypto';
import {Problem} from '../../database/src/index.ts';
import type {CheckoutInput,CheckoutResult,NormalizedEvent,PaymentProvider,PaymentStatus,Network} from './provider.ts';

// AzamPay adapter. Mobile-money checkout: the buyer stays on our page and the
// network pushes a PIN prompt to their handset, so we collect the number and the
// network ourselves and never see a PIN.
//
// Two things about this provider shape the code below.
//
// Callbacks are signed, but not the way most gateways sign them: there is no
// HMAC over the raw body. AzamPay signs the concatenation of four named fields
// with its own RSA key, so verification reconstructs that string and checks a
// PKCS#1 v1.5 signature against the checkout public key. The callback URL also
// carries an unguessable secret as its last path segment, which is checked
// first -- two independent factors, and the signature is the one that matters.
//
// There is no status endpoint for collections. GetTransactionStatus is for
// disbursements only, so `fetchStatus` cannot confirm an MNO checkout and does
// not pretend to: webhooks are the only channel, which is exactly why they have
// to be verified properly rather than trusted.

const PAID=['success','successful','completed','paid'];
const FAILED=['fail','failed','cancel','cancelled','canceled','expired','declined','reversed','insufficient','timeout'];

const authBase=()=>(process.env.AZAM_AUTH_URL||'https://authenticator.azampay.co.tz').replace(/\/+$/,'');
const apiBase=()=>(process.env.AZAM_BASE_URL||'https://checkout.azampay.co.tz').replace(/\/+$/,'');
/**
 * Where the checkout request is posted. Defaults to AzamPay directly.
 *
 * It is configurable because this shop settles through a partner's AzamPay
 * account rather than its own: the partner's gateway takes the request, and
 * `AZAM_SOURCE` is the name they disburse against. Only an https host is
 * accepted, so a misconfiguration cannot silently send a payment request --
 * with our bearer token on it -- over plaintext.
 */
function checkoutUrl():string{
 const configured=(process.env.AZAM_CHECKOUT_URL||'').trim();
 if(!configured)return apiBase()+'/azampay/mno/checkout';
 let url:URL;
 try{url=new URL(configured);}catch{throw new Problem(503,'Mobile payment is not configured correctly.');}
 if(url.protocol!=='https:'||url.username||url.password)throw new Problem(503,'Mobile payment is not configured correctly.');
 return url.toString();
}

/**
 * The tag the settling partner routes and disburses on. Never shown to the buyer.
 *
 * Lower case, and it matters: the partner matches this value to decide which
 * callback URL to return the result to. A capitalised "Pastory" was accepted at
 * checkout and then silently never called back, because it matched nothing.
 */
const sourceName=()=>process.env.AZAM_SOURCE||'pastory';

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
 * Tanzanian mobile numbers, normalised to the local 0XXXXXXXXX form.
 *
 * Not the 255… international form. The gateway this shop settles through is
 * driven by an integration that validates /^0\d{9}$/ and forwards the number
 * untouched, and those payments reach handsets -- so the ten-digit local form
 * is what demonstrably works, whatever the international convention suggests.
 *
 * Accepts 07…, 7…, +2557… and 2557… from the buyer, and rejects anything else
 * rather than sending a number the network will silently fail to reach.
 */
export function normalizePhone(value:string):string{
 const digits=(value||'').replace(/\D/g,'');
 const local=digits.startsWith('255')?digits.slice(3):digits.startsWith('0')?digits.slice(1):digits;
 if(!/^[67]\d{8}$/.test(local))throw new Problem(400,'Enter a valid Tanzanian mobile number, for example 0712 345 678.');
 return '0'+local;
}

/** PEM for the checkout callback key. Accepts a literal newline or an escaped one. */
function publicKey():string{
 const raw=(process.env.AZAM_CALLBACK_PUBLIC_KEY||'').trim();
 return raw?raw.replace(/\\n/g,'\n'):'';
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

interface CheckoutResponse {success?:boolean;transactionId?:string;reference?:string;message?:string;data?:{transactionId?:string}}
type Callback=Record<string,unknown>;
const first=(body:Callback,...names:string[]):string|null=>{
 for(const name of names){const value=body[name];if(typeof value==='string'&&value)return value;if(typeof value==='number')return String(value);}
 return null;
};

export const azamProvider:PaymentProvider={
 name:'azam',
 flow:'push',
 networks:AZAM_NETWORKS,
 confirmsOutOfBand:false,   // no collection status endpoint exists; the signature is the check

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
   // `source` is what the settling partner disburses against, so it has to be
   // exactly the name they expect.
   //
   // The reference is carried three ways because only one of them is
   // guaranteed to survive. AzamPay types additionalProperties as property1 and
   // property2, so a custom key can be dropped in transit; externalId is
   // routinely rewritten by the network into one of its own reference fields.
   // property2 is the one AzamPay itself promises to carry, and the working
   // integration this shop settles through reads exactly that.
   additionalProperties:{source:sourceName(),property1:sourceName(),property2:input.reference,intent_reference:input.reference},
  };
  let response:Response,text='';
  try{
   response=await fetch(checkoutUrl(),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
   text=await response.text();
  }catch{throw new Problem(502,'Could not reach the payment service. Please try again or pay the attendant.');}
  // A rejected token is worth one retry with a fresh one; anything else is not.
  if(response.status===401){resetToken();throw new Problem(502,'The payment service rejected this request. Please try again or pay the attendant.');}
  let json:CheckoutResponse={};
  try{json=text?JSON.parse(text):{};}catch{/* non-JSON body */}
  // A partner gateway in front of AzamPay may echo the id under its own name.
  const reference=json.transactionId||json.data?.transactionId||json.reference||null;
  // Never echo the provider's own message: it can carry account detail.
  if(!response.ok||json.success===false||!reference)throw new Problem(502,'The payment service could not start this purchase. Please try again or pay the attendant.');
  return {provider:'azam',reference,checkout_url:null,flow:'push',
   instruction:'Check your phone. Enter your mobile money PIN to approve the payment.'};
 },

 /**
  * Two factors. The URL secret proves the caller knew something only AzamPay was
  * given; the RSA signature proves AzamPay sent it.
  *
  * Fails closed: with no public key configured, a callback is refused unless
  * unsigned callbacks have been explicitly allowed. There is no status endpoint
  * to fall back on for collections, so an unverified callback is the only thing
  * standing between a stranger and a free voucher.
  */
 verifyWebhook(rawBody,headers){
  const secret=process.env.AZAM_CALLBACK_TOKEN||'';
  if(!secret)return false;
  const presented=headers['x-callback-token']||headers.authorization?.replace(/^Bearer\s+/i,'')||'';
  if(!presented)return false;
  // Hash both sides so the comparison is over equal lengths whatever is sent.
  const a=createHash('sha256').update(presented).digest(),b=createHash('sha256').update(secret).digest();
  if(!timingSafeEqual(a,b))return false;

  const pem=publicKey();
  if(!pem)return process.env.AZAM_ALLOW_UNSIGNED_CALLBACKS==='true';
  let body:Callback;
  try{body=JSON.parse(Buffer.isBuffer(rawBody)?rawBody.toString('utf8'):String(rawBody));}catch{return false;}
  const signature=typeof body.signature==='string'?body.signature:'';
  if(!signature)return false;
  // AzamPay signs these four fields concatenated, in this order -- not the body.
  const signed=['utilityref','externalreference','transactionstatus','operator'].map(name=>String(body[name]??'')).join('');
  try{return createVerify('RSA-SHA256').update(signed).end().verify(pem,signature,'base64');}
  catch{return false;}
 },

 parseEvent(body:unknown):NormalizedEvent{
  const e=(body||{}) as Callback;
  const additional=(e.additionalProperties||{}) as Callback;
  const reference=first(e,'transid','transactionId','transaction_id','pgReferenceId','reference','mnoreference','mnoReference','fspReferenceId');
  if(!reference)throw new Problem(400,'Callback is missing a transaction reference');
  // property2 before intent_reference: it is the field AzamPay guarantees to
  // carry, so it is the one most likely to come back untouched.
  const own=first(additional,'property2','intent_reference')||first(e,'utilityref','utilityRef','externalId','external_id','externalID','externalreference','externalReference','external_reference');
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
  * Not available for collections.
  *
  * AzamPay's transaction-status endpoint answers for disbursements, not for MNO
  * checkout, so there is nothing honest to return here. Null means "not known",
  * and callers already treat that as "not paid" -- a buyer whose callback never
  * arrives has their hold expire and their stock returned, rather than being
  * told a payment succeeded on no evidence.
  */
 async fetchStatus():Promise<PaymentStatus|null>{return null;}
};

/**
 * The shape of a rejected callback -- names only, never values.
 *
 * This is how the signing scheme gets settled. The published SDKs disagree
 * about where AzamPay puts the signature: one reads a `signature` field in the
 * body, another an `x-azampay-signature` header, and they differ on which
 * fields the signature covers. One real callback answers it, and until then
 * nothing here assumes an answer.
 *
 * Header and body names only. A phone number or a reference never lands in the
 * audit trail this way.
 */
export function callbackShape(rawBody:Buffer|string,headers:Record<string,string|undefined>={}):string[]{
 const shape:string[]=[];
 try{
  const body=JSON.parse(Buffer.isBuffer(rawBody)?rawBody.toString('utf8'):String(rawBody));
  if(body&&typeof body==='object')shape.push(...Object.keys(body).sort().map(name=>'body.'+name));
 }catch{shape.push('body.<unparseable>');}
 // Anything that looks like it could carry a signature, plus the content type.
 for(const name of Object.keys(headers).sort())
  if(/sign|auth|azam|hash|digest|content-type/i.test(name))shape.push('header.'+name.toLowerCase());
 return shape;
}

export const isAzamFailure=(status:string)=>{const s=status.toLowerCase();return FAILED.some(word=>s.includes(word));};

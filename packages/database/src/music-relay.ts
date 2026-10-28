import {createHash,createHmac} from 'node:crypto';
import {pool,Problem} from './index.ts';
import {azamProvider} from '../../payments/src/azam.provider.ts';

const REFERENCE=/^PTM-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PAID=new Set(['success','successful','completed','paid']);
const FAILED=new Set(['fail','failed','cancel','cancelled','canceled','expired','declined','reversed','insufficient','timeout']);
export const MUSIC_RELAY_PATH='/api/billing/relay';
export type MusicRelayEvent={version:1;source:'pastory';provider:'azam';eventId:string;reference:string;providerReference:string;status:'paid'|'failed'|'pending'|'review';amount:number|null;currency:string|null};

export function musicRelayConfig(env:Record<string,string|undefined>=process.env){
 if(env.MUSIC_RELAY_ENABLED!=='true')return null;
 const key=env.MUSIC_RELAY_SECRET||'';
 let url:URL;
 try{url=new URL(env.MUSIC_RELAY_URL||'');}catch{throw new Problem(503,'Music relay is not configured.');}
 if(!/^[a-f0-9]{64}$/i.test(key)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!==MUSIC_RELAY_PATH)
  throw new Problem(503,'Music relay is not configured.');
 return {key,url:url.toString()};
}

/** Only upstream-authenticated callbacks may reach this function in production.
 * References must use the observed gateway fields, not free-form metadata.
 * This partner omits currency. A deployment may explicitly pin its settlement
 * currency; an explicit callback currency always takes precedence. */
export function normalizeMusicEvent(body:Record<string,unknown>,settlementCurrency?:string):MusicRelayEvent|null{
 const signed=['utilityref','externalreference','transactionstatus','operator'];
 if(!signed.every(k=>typeof body[k]==='string'&&(body[k] as string).length>0&&(body[k] as string).length<=200))return null;
 const a=String(body.utilityref),b=String(body.externalreference);
 const reference=REFERENCE.test(a)?a:REFERENCE.test(b)?b:null;
 if(!reference)return null;
 const providerReference=reference===a?b:a;
 if(REFERENCE.test(providerReference))return null;
 const rawStatus=String(body.transactionstatus).toLowerCase();
 const status=PAID.has(rawStatus)?'paid':FAILED.has(rawStatus)?'failed':['pending','processing','initiated'].includes(rawStatus)?'pending':'review';
 const amount=typeof body.amount==='number'||typeof body.amount==='string'?Number(body.amount):NaN;
 const normalizedAmount=Number.isSafeInteger(amount)&&amount>0?amount:null;
 const currency=typeof body.currency==='string'?body.currency:body.currency==null&&settlementCurrency==='TZS'?'TZS':null;
 return {version:1,source:'pastory',provider:'azam',eventId:createHash('sha256').update(JSON.stringify([reference,providerReference,rawStatus,body.operator,normalizedAmount,currency])).digest('hex'),
  reference,providerReference,status,amount:normalizedAmount,currency};
}

/** Intercept ONLY music callbacks, before generic event deduplication. A durable
 * insert is the acknowledgment boundary; delivery is a separate worker task. */
export async function captureMusicCallback(rawBody:Buffer|string,headers:Record<string,string|undefined>,provider:string):Promise<boolean>{
 if(provider!=='azam')return false;
 const raw=String(rawBody);
 let body:Record<string,unknown>;
 try{body=JSON.parse(raw);}catch{return false;}
 if(!body||typeof body!=='object')return false;
 const extra=body.additionalProperties as Record<string,unknown>|undefined;
 const candidate=[body.utilityref,body.externalreference,extra?.property2,extra?.intent_reference].some(v=>typeof v==='string'&&v.startsWith('PTM-'));
 if(!candidate)return false;
 if(!musicRelayConfig()||(process.env.AZAM_SOURCE||'pastory')!=='pastory')throw new Problem(503,'Music relay is not ready.');
 // RSA is the default. This existing partner routes through a secret callback
 // URL and has no configured public key. Trust that boundary only when an
 // operator explicitly selects callback-token and the secret is 256-bit hex.
 // The legacy unsigned flag ALONE never enables music settlement.
 const mode=process.env.MUSIC_RELAY_UPSTREAM_AUTH||'rsa';
 const configured=mode==='rsa'?!!process.env.AZAM_CALLBACK_PUBLIC_KEY?.trim():
  mode==='callback-token'&&/^[a-f0-9]{64}$/i.test(process.env.AZAM_CALLBACK_TOKEN||'')&&process.env.AZAM_ALLOW_UNSIGNED_CALLBACKS==='true';
 if(!configured||!azamProvider.verifyWebhook(rawBody,headers))throw new Problem(401,'Invalid callback authentication');
 if(Buffer.byteLength(raw)>65536)throw new Problem(400,'Callback too large');
 const event=normalizeMusicEvent(body,process.env.MUSIC_RELAY_SETTLEMENT_CURRENCY);
 if(!event)throw new Problem(400,'Music payment needs matching references.');
 await pool.query(`insert into wifi.music_payment_relay_outbox(event_id,payload) values($1,$2)
  on conflict(event_id) do nothing`,[event.eventId,event]);
 return true;
}

export function relayHeaders(body:string,key:string,now=Date.now()){
 const timestamp=String(Math.floor(now/1000));
 const signature=createHmac('sha256',Buffer.from(key,'hex')).update(`v1\nPOST\n${MUSIC_RELAY_PATH}\n${timestamp}\n${body}`).digest('hex');
 return {'content-type':'application/json','x-pastatrade-relay-timestamp':timestamp,'x-pastatrade-relay-signature':signature};
}

/** One leased row per call. Failed or interrupted deliveries survive restarts.
 * Backoff is capped at one hour; undelivered rows are never silently discarded. */
export async function deliverMusicCallbackOne():Promise<boolean>{
 const config=musicRelayConfig();if(!config)return false;
 const row=(await pool.query(`with candidate as (
  select event_id from wifi.music_payment_relay_outbox where delivered_at is null
   and next_attempt_at<=now() and (locked_until is null or locked_until<now())
   order by created_at for update skip locked limit 1
 ) update wifi.music_payment_relay_outbox o set attempts=o.attempts+1,locked_until=now()+interval '45 seconds'
  from candidate c where o.event_id=c.event_id returning o.event_id,o.payload,o.attempts`)).rows[0];
 if(!row)return false;
 const body=JSON.stringify(row.payload);let delivered=false,status=0;
 try{
  const response=await fetch(config.url,{method:'POST',headers:relayHeaders(body,config.key),body,redirect:'error',signal:AbortSignal.timeout(8000)});
  status=response.status;
  // A proxy-generated 200 page must not count as a delivered payment.
  if(response.ok&&(Number(response.headers.get('content-length')||0)<=1024)){
   const reader=response.body?.getReader();let text='',bytes=0;
   if(reader)try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>1024)break;text+=Buffer.from(chunk.value).toString('utf8');}}finally{await reader.cancel();}
   if(bytes<=1024)try{delivered=JSON.parse(text).received===row.event_id;}catch{/* retry */}
  }
 }catch{/* Store only a status code; never log callback bodies, secrets or phone numbers. */}
 const delay=Math.min(3600,5*2**Math.min(row.attempts,10));
 await pool.query(`update wifi.music_payment_relay_outbox set delivered_at=case when $3 then now() else null end,
  locked_until=null,last_http_status=$4,next_attempt_at=now()+($5*interval '1 second')
  where event_id=$1 and attempts=$2 and delivered_at is null`,[row.event_id,row.attempts,delivered,status,delay]);
 if(!delivered)console.warn('Music callback delivery pending; durable retry scheduled.',{eventId:row.event_id,attempt:row.attempts,status});
 return true;
}

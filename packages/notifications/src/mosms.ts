// MoSMS (mosms.co.tz) over its REST API: one POST per message, Bearer token.
//
// The token is a Sanctum personal access token for the shop's MoSMS account.
// Get it once (POST /api/login) and keep it in MOSMS_TOKEN. Never call
// /api/logout with it: that revokes the token the server sends with.
//
// Like the email sender, every failure is classified, because the worker's one
// decision is whether trying again could help. A timeout, a rate limit, a 5xx,
// an empty balance or a rejected token might, once the shop tops up or fixes the
// key; a malformed number will not.
//
// MoSMS has no idempotency key. A send that timed out after MoSMS accepted it
// can reach the buyer twice. Both texts carry the same code, so that is the
// lesser harm next to a buyer with no code.

export type SmsConfig={token:string;baseUrl:string};
export type SmsResult={ok:true;id:string|null}|{ok:false;retryable:boolean;status:number;error:string};

/** Null without a token, so the feature stays off and no backlog builds up. */
export function smsConfig(env:NodeJS.ProcessEnv=process.env):SmsConfig|null{
 const token=(env.MOSMS_TOKEN||'').trim();
 if(!token)return null;
 const baseUrl=((env.MOSMS_BASE_URL||'').trim()||'https://mosms.co.tz/api').replace(/\/+$/,'');
 return {token,baseUrl};
}

/** A Tanzanian mobile number in any of the forms buyers type, or null. MoSMS normalises it again server-side. */
export function smsNumber(value:string|null|undefined):string|null{
 const digits=String(value??'').replace(/[\s()+-]/g,'');
 if(/^0[67]\d{8}$/.test(digits))return '255'+digits.slice(1);
 if(/^255[67]\d{8}$/.test(digits))return digits;
 if(/^[67]\d{8}$/.test(digits))return '255'+digits;
 return null;
}

export async function sendSms(to:string,text:string,config:SmsConfig,fetchImpl:typeof fetch=fetch):Promise<SmsResult>{
 let response:Response;
 try{
  response=await fetchImpl(config.baseUrl+'/sms/send',{
   method:'POST',
   headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({to,text}),
   signal:AbortSignal.timeout(15000),
  });
 }catch(error){
  return {ok:false,retryable:true,status:0,error:'Could not reach MoSMS: '+((error as Error).name==='TimeoutError'?'timed out':'network error')};
 }
 let body:{data?:{id?:number|string;status?:string};message?:string;balance?:number;errors?:Record<string,string[]>}={};
 try{body=await response.json();}catch{/* non-JSON body */}
 if(response.ok)return {ok:true,id:body.data?.id==null?null:String(body.data.id)};
 // 422 means two things: an empty balance (it says how much is left), which a
 // top-up fixes, or a rejected field such as the number, which it does not.
 const noBalance=response.status===422&&typeof body.balance==='number';
 const retryable=noBalance||response.status===401||response.status===403||response.status===408||response.status===429||response.status>=500;
 const detail=body.errors?Object.values(body.errors).flat()[0]:undefined;
 // MoSMS's messages never echo the token, so they are safe to keep.
 return {ok:false,retryable,status:response.status,error:String(detail||body.message||'HTTP '+response.status).slice(0,300)};
}

/** Remaining credits, for a health check. Null when MoSMS cannot be asked. */
export async function smsBalance(config:SmsConfig,fetchImpl:typeof fetch=fetch):Promise<number|null>{
 try{
  const response=await fetchImpl(config.baseUrl+'/balance',{headers:{Authorization:'Bearer '+config.token,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return null;
  const body=await response.json() as {sms_balance?:number};
  return typeof body.sms_balance==='number'?body.sms_balance:null;
 }catch{return null;}
}

// GSM-7: the alphabet one 160-character SMS segment can carry. One character
// outside it (a curly quote, an emoji) makes the whole text Unicode, 70 per
// segment, and doubles or triples the cost.
const GSM=/^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/;
export const isGsm=(text:string)=>GSM.test(text);
/** Shop-typed text made safe for one plain segment: common look-alikes swapped, anything else dropped. */
export function toGsm(text:string){
 return text.replace(/[‘’`´]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/[·•]/g,'-').replace(/…/g,'...')
  .split('').filter(c=>GSM.test(c)).join('').replace(/\s+/g,' ').trim();
}

export type VoucherSms={brand:string;code:string;packageName:string;sellerPhone?:string};
export const SMS_LIMIT=160;
/**
 * The buyer's text, in Swahili, in one plain segment. Only the package name is
 * shortened to fit; the code, the brand and the instruction always go out whole.
 */
export function renderVoucherSms(m:VoucherSms):string{
 const brand=toGsm(m.brand).slice(0,30).trim()||'Wi-Fi';
 const code=toGsm(m.code);
 const help=m.sellerPhone&&/^0\d{9}$/.test(m.sellerPhone)?` Msaada: ${m.sellerPhone}`:'';
 const build=(name:string)=>`${brand}: Malipo yamepokelewa. Vocha yako: ${code}${name?` (${name})`:''}. Iweke kwenye ukurasa wa Wi-Fi kuunganisha.${help}`;
 let name=toGsm(m.packageName);
 const room=SMS_LIMIT-build('').length-3;
 if(name.length>room)name=room>4?name.slice(0,room-3).trimEnd()+'...':'';
 const text=build(name);
 // Still too long only if the brand itself is huge: drop the help line, then the name.
 if(text.length<=SMS_LIMIT)return text;
 const bare=`${brand}: Vocha yako: ${code}. Iweke kwenye ukurasa wa Wi-Fi kuunganisha.`;
 return bare.slice(0,SMS_LIMIT);
}

// Resend over its HTTP API. No SDK: one POST is all this needs, and a
// dependency would be more surface than the call it wraps.
//
// Every failure is classified, because the caller's only real decision is
// whether trying again could help. A timeout, a rate limit or a 5xx might; a
// rejected key or an unverified sender will not, however often it is retried.

export type EmailConfig={apiKey:string;from:string;to:string[]};
export type EmailMessage={from:string;to:string[];subject:string;html:string;text:string;idempotencyKey?:string};
export type SendResult={ok:true;id:string}|{ok:false;retryable:boolean;status:number;error:string};

const EMAIL=/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * Null unless both a key and at least one valid recipient are set, so a
 * half-configured install sends nothing rather than failing on every sale.
 */
export function emailConfig(env:NodeJS.ProcessEnv=process.env):EmailConfig|null{
 const apiKey=(env.RESEND_API_KEY||'').trim();
 const to=(env.SALE_ALERT_EMAIL||'').split(',').map(v=>v.trim()).filter(v=>EMAIL.test(v)).slice(0,10);
 if(!apiKey||!to.length)return null;
 // Resend only sends from a domain verified in its dashboard. onboarding@resend.dev
 // works without one, but only to the address that owns the Resend account.
 const from=(env.RESEND_FROM||'').trim()||'JIACHIE WIFI <onboarding@resend.dev>';
 return {apiKey,from,to};
}

export async function sendEmail(message:EmailMessage,apiKey:string,fetchImpl:typeof fetch=fetch):Promise<SendResult>{
 let response:Response;
 try{
  response=await fetchImpl('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',
    // Resend drops a repeat with the same key, so a worker that dies after the
    // send but before recording it cannot deliver the email twice.
    ...(message.idempotencyKey?{'Idempotency-Key':message.idempotencyKey}:{})},
   body:JSON.stringify({from:message.from,to:message.to,subject:message.subject,html:message.html,text:message.text}),
   signal:AbortSignal.timeout(15000),
  });
 }catch(error){
  return {ok:false,retryable:true,status:0,error:'Could not reach Resend: '+((error as Error).name==='TimeoutError'?'timed out':'network error')};
 }
 let body:{id?:string;message?:string;name?:string}={};
 try{body=await response.json();}catch{/* non-JSON body */}
 if(response.ok&&body.id)return {ok:true,id:body.id};
 const retryable=response.status===408||response.status===429||response.status>=500;
 // Resend's own message says what is wrong ("domain is not verified", "API key
 // is invalid"). It never echoes the key, so it is safe to keep.
 return {ok:false,retryable,status:response.status,error:String(body.message||body.name||'HTTP '+response.status).slice(0,300)};
}

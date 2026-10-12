import {smsNumber} from './mosms.ts';
import {formatDuration,money,speed,networkLabel,providerLabel,when,type SalePaid,type SaleContext} from './sale-email.ts';

// The owner's "you just made a sale", by WhatsApp, through Makutano Connect
// (connect.makutano.co.tz): the same details as the sale email, sent from the
// shop's Connect account to the owner's phone.
//
// WhatsApp lets a business start a conversation only with a template Meta has
// approved. Free text is accepted only while the owner has written to the
// business number in the last 24 hours, so a dependable alert needs
// CONNECT_SALE_TEMPLATE: the template's variables are filled, in order, from
// CONNECT_SALE_TEMPLATE_FIELDS. Without a template the alert goes as text and
// Connect refuses it once that window is closed.
//
// Like the email, the voucher code is never included and the customer's number
// is masked before it is even queued.

/** What a template variable can be filled with, and the default order. */
export const SALE_FIELDS=['amount','package','access','speed','paid_with','paid_at','customer','receipt','reference','today','link'] as const;
export type SaleField=typeof SALE_FIELDS[number];

export type WhatsAppConfig={
 apiKey:string;baseUrl:string;to:string[];
 template:{name:string;language:string;fields:SaleField[]}|null;
};
export type WhatsAppResult={ok:true;id:string|null}|{ok:false;retryable:boolean;status:number;error:string};

/** Why the WhatsApp alerts are off, for the worker's start-up line; null when they are on. */
export function whatsappSetupIssue(env:NodeJS.ProcessEnv=process.env):string|null{
 const key=(env.CONNECT_API_KEY||'').trim();
 if(!key)return 'set CONNECT_API_KEY and SALE_ALERT_WHATSAPP to turn them on';
 if(!/^mk_(live|test)_/.test(key))return 'CONNECT_API_KEY is not a Makutano Connect key (mk_live_…)';
 if(!alertNumbers(env).length)return 'SALE_ALERT_WHATSAPP has no Tanzanian mobile number';
 const unknown=templateFields(env).filter(f=>!(SALE_FIELDS as readonly string[]).includes(f));
 if((env.CONNECT_SALE_TEMPLATE||'').trim()&&unknown.length)return `CONNECT_SALE_TEMPLATE_FIELDS has unknown field(s): ${unknown.join(', ')} (use ${SALE_FIELDS.join(', ')})`;
 return null;
}

/** Null unless a Connect key and an owner number are both set, so nothing queues while it is off. */
export function whatsappConfig(env:NodeJS.ProcessEnv=process.env):WhatsAppConfig|null{
 if(whatsappSetupIssue(env))return null;
 const name=(env.CONNECT_SALE_TEMPLATE||'').trim();
 const fields=templateFields(env);
 return {
  apiKey:(env.CONNECT_API_KEY||'').trim(),
  baseUrl:((env.CONNECT_API_URL||'').trim()||'https://connect.makutano.co.tz/api/v1').replace(/\/+$/,''),
  to:alertNumbers(env),
  template:name?{name,language:(env.CONNECT_SALE_TEMPLATE_LANG||'').trim()||'en',fields:(fields.length?fields:[...SALE_FIELDS]) as SaleField[]}:null,
 };
}

// Connect does not add a country code, so 0752… would go to the wrong place: always 255….
const alertNumbers=(env:NodeJS.ProcessEnv)=>[...new Set((env.SALE_ALERT_WHATSAPP||'').split(',').map(n=>smsNumber(n.trim())).filter((n):n is string=>!!n))].slice(0,10);
const templateFields=(env:NodeJS.ProcessEnv)=>(env.CONNECT_SALE_TEMPLATE_FIELDS||'').split(',').map(f=>f.trim()).filter(Boolean);

/** The sale's details by name, worded exactly as in the sale email. */
export function saleFields(sale:SalePaid,context:SaleContext):Record<SaleField,string>{
 return {
  amount:'TZS '+money(sale.amountTzs),
  package:sale.packageName,
  access:formatDuration(sale.durationMinutes),
  speed:speed(sale.downloadMbps,sale.uploadMbps),
  paid_with:`${networkLabel(sale.network)} through ${providerLabel(sale.provider)}`,
  paid_at:when(sale.paidAt),
  customer:sale.customer,
  receipt:sale.receipt,
  reference:sale.reference,
  today:`Sale #${context.todayCount} today · TZS ${money(context.todayTotalTzs)} so far`,
  link:context.portalUrl,
 };
}

/** The free-text alert: the sale email's text, with WhatsApp's *bold*. */
export function renderSaleWhatsApp(sale:SalePaid,context:SaleContext):string{
 const f=saleFields(sale,context);
 return [
  `*${context.brand} — new sale*`,'',
  `Payment received: *${f.amount}*`,
  f.paid_with,
  `${f.paid_at} (Tanzania time)`,
  f.today,'',
  `Package: ${f.package}`,
  `Access: ${f.access}`,
  `Speed: ${f.speed}`,
  `Paid with: ${f.paid_with}`,
  `Customer: ${f.customer}`,
  `Receipt: ${f.receipt}`,
  `Reference: ${f.reference}`,'',
  `View in the portal: ${f.link}`,'',
  'Voucher codes are never included in these messages.',
 ].join('\n');
}

// Meta refuses a template variable that is empty or holds a line break, a tab or
// more than four spaces in a row.
const oneLine=(value:string)=>value.replace(/[\r\n\t]+/g,' ').replace(/ {4,}/g,'   ').trim()||'—';

/** The request body for one recipient. Built only from the stored sale, so a retry sends the same bytes. */
export function saleWhatsAppBody(to:string,sale:SalePaid,context:SaleContext,config:WhatsAppConfig){
 // 'sync': Connect answers once WhatsApp has accepted the message, so a refusal
 // lands in this outbox row instead of in Connect's log.
 if(config.template){
  const f=saleFields(sale,context);
  return {to,dispatch:'sync',content:{type:'template',templateName:config.template.name,language:config.template.language,
   components:[{type:'body',parameters:config.template.fields.map(field=>({type:'text',text:oneLine(f[field])}))}]}};
 }
 return {to,dispatch:'sync',content:{type:'text',text:renderSaleWhatsApp(sale,context),previewUrl:false}};
}

/**
 * One POST to Connect. Every failure is classified for the worker's one
 * decision -- would trying again help? A timeout, a rate limit, a 5xx, no
 * credits left, a key or number being fixed, a template awaiting approval: yes.
 * A malformed request, an owner who sent STOP, free text outside the 24-hour
 * window or a template WhatsApp does not know: no.
 */
export async function sendWhatsApp(body:object,config:WhatsAppConfig,idempotencyKey:string,fetchImpl:typeof fetch=fetch):Promise<WhatsAppResult>{
 let response:Response;
 try{
  response=await fetchImpl(config.baseUrl+'/whatsapp/messages',{
   method:'POST',
   headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json',Accept:'application/json','Idempotency-Key':idempotencyKey},
   body:JSON.stringify(body),
   // Connect waits for WhatsApp, with its own retries, before it answers a sync send.
   signal:AbortSignal.timeout(90000),
  });
 }catch(error){
  return {ok:false,retryable:true,status:0,error:'Could not reach Makutano Connect: '+((error as Error).name==='TimeoutError'?'timed out':'network error')};
 }
 let reply:{success?:boolean;data?:{id?:string;waMessageId?:string};error?:{code?:string;message?:string;details?:{reason?:string}}}={};
 try{reply=await response.json();}catch{/* non-JSON body */}
 if(response.ok&&reply.success!==false)return {ok:true,id:reply.data?.waMessageId??reply.data?.id??null};
 const code=reply.error?.code||'',reason=reply.error?.details?.reason||'',message=reply.error?.message||'';
 const permanent=(response.status===422&&(code==='VALIDATION_ERROR'||(code==='WHATSAPP_POLICY_BLOCKED'&&(reason==='OPTED_OUT'||reason==='SERVICE_WINDOW_CLOSED'))))
  // WhatsApp's own template errors (#132000 to #132018): the template's name, language or variables do not fit.
  ||(response.status===502&&/\(#132\d{3}\)/.test(message));
 // Connect's messages never echo the key, so they are safe to keep.
 return {ok:false,retryable:!permanent,status:response.status,error:([code,reason].filter(Boolean).join('/')+(message?': '+message:'')||'HTTP '+response.status).slice(0,300)};
}

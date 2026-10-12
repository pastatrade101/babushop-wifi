import {it,expect} from 'vitest';
import {whatsappConfig,whatsappSetupIssue,saleFields,renderSaleWhatsApp,saleWhatsAppBody,sendWhatsApp,renderSalePaid,SALE_FIELDS,type SalePaid,type WhatsAppConfig} from '../packages/notifications/src/index.ts';
import {enqueueSaleWhatsApp,deliverWhatsAppOne} from '../packages/database/src/notifications.ts';

const KEY='mk_live_test_key_never_real';
const config:WhatsAppConfig={apiKey:KEY,baseUrl:'https://connect.test/api/v1',to:['255752000000'],template:null};
const withTemplate:WhatsAppConfig={...config,template:{name:'jiachie_sale_alert',language:'en',fields:[...SALE_FIELDS]}};
const reply=(status:number,body:unknown)=>async()=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

const sale:SalePaid={saleId:'sale-1',receipt:'JW-RECEIPT',reference:'JW-REFERENCE',amountTzs:10000,packageName:'JIACHIE MWEZI',
 durationMinutes:43200,downloadMbps:10,uploadMbps:5,provider:'azam',network:'vodacom',customer:'0758 ••• 054',paidAt:'2026-09-24T09:05:00.000Z'};
const context={brand:'JIACHIE WIFI',portalUrl:'https://jiachie-wifi.com/payments?q=JW-REFERENCE',todayCount:3,todayTotalTzs:12000};

it('stays off until a Connect key and an owner number are both set, and says why',()=>{
 expect(whatsappConfig({})).toBeNull();
 expect(whatsappSetupIssue({})).toContain('CONNECT_API_KEY');
 expect(whatsappConfig({CONNECT_API_KEY:KEY})).toBeNull();
 expect(whatsappConfig({CONNECT_API_KEY:'sk_not_connect',SALE_ALERT_WHATSAPP:'0752000000'})).toBeNull();
 expect(whatsappConfig({CONNECT_API_KEY:KEY,SALE_ALERT_WHATSAPP:'12345'})).toBeNull();
 expect(whatsappConfig({CONNECT_API_KEY:KEY,SALE_ALERT_WHATSAPP:'0752000000'})).toEqual({apiKey:KEY,baseUrl:'https://connect.makutano.co.tz/api/v1',to:['255752000000'],template:null});
});

it('sends to 255… numbers only, once each, because Connect adds no country code',()=>{
 expect(whatsappConfig({CONNECT_API_KEY:KEY,SALE_ALERT_WHATSAPP:'0752000000, +255 752 000 000,0699100842'})?.to).toEqual(['255752000000','255699100842']);
});

it('uses an approved template when one is named, in the default or the configured variable order',()=>{
 expect(whatsappConfig({CONNECT_API_KEY:KEY,SALE_ALERT_WHATSAPP:'0752000000',CONNECT_SALE_TEMPLATE:'jiachie_sale_alert'})?.template)
  .toEqual({name:'jiachie_sale_alert',language:'en',fields:[...SALE_FIELDS]});
 expect(whatsappConfig({CONNECT_API_KEY:KEY,SALE_ALERT_WHATSAPP:'0752000000',CONNECT_SALE_TEMPLATE:'t',CONNECT_SALE_TEMPLATE_LANG:'sw',CONNECT_SALE_TEMPLATE_FIELDS:'amount, package ,link'})?.template)
  .toEqual({name:'t',language:'sw',fields:['amount','package','link']});
 // A field the sender does not know would fill the template wrongly: off, and the reason is given.
 const bad={CONNECT_API_KEY:KEY,SALE_ALERT_WHATSAPP:'0752000000',CONNECT_SALE_TEMPLATE:'t',CONNECT_SALE_TEMPLATE_FIELDS:'amount,price'};
 expect(whatsappConfig(bad)).toBeNull();
 expect(whatsappSetupIssue(bad)).toContain('price');
});

it('carries every detail of the sale email, worded the same, and never a voucher code',()=>{
 const text=renderSaleWhatsApp(sale,context);
 const email=renderSalePaid(sale,context).text;
 for(const detail of ['TZS 10,000','JIACHIE MWEZI','1 month (30 days)','Up to 10 Mbps down · 5 Mbps up','M-Pesa (Vodacom) through AzamPay',
  '24 Sept 2026, 12:05','Sale #3 today · TZS 12,000 so far','0758 ••• 054','JW-RECEIPT','JW-REFERENCE','https://jiachie-wifi.com/payments?q=JW-REFERENCE']){
  expect(text,detail).toContain(detail);
  expect(email,detail).toContain(detail);
 }
 expect(text.startsWith('*JIACHIE WIFI — new sale*')).toBe(true);
 expect(text).toContain('Payment received: *TZS 10,000*');
});

it('fills the template variables in order, one line each, never empty',()=>{
 const body=saleWhatsAppBody('255752000000',{...sale,packageName:'TWO\nLINES\twith    gaps',customer:''},context,withTemplate) as any;
 expect(body).toMatchObject({to:'255752000000',dispatch:'sync',content:{type:'template',templateName:'jiachie_sale_alert',language:'en'}});
 const values=body.content.components[0].parameters.map((p:any)=>p.text);
 expect(values).toHaveLength(SALE_FIELDS.length);
 expect(values[0]).toBe('TZS 10,000');
 expect(values[1]).toBe('TWO LINES with   gaps');
 expect(values[SALE_FIELDS.indexOf('customer')]).toBe('—');
 expect(values.at(-1)).toBe('https://jiachie-wifi.com/payments?q=JW-REFERENCE');
 expect(saleFields(sale,context).today).toBe('Sale #3 today · TZS 12,000 so far');
});

it('posts to Connect with the key, an idempotency key and a sync send, and reads the WhatsApp message id',async()=>{
 let url='',init:RequestInit={};
 const fetchImpl=(async(u:string,i:RequestInit)=>{url=u;init=i;return reply(201,{success:true,data:{id:'msg-1',status:'SENT',waMessageId:'wamid.ABC'}})();}) as any;
 const result=await sendWhatsApp(saleWhatsAppBody('255752000000',sale,context,config),config,'sale-whatsapp/row-1',fetchImpl);
 expect(result).toEqual({ok:true,id:'wamid.ABC'});
 expect(url).toBe('https://connect.test/api/v1/whatsapp/messages');
 const headers=init.headers as Record<string,string>;
 expect(headers.Authorization).toBe('Bearer '+KEY);
 expect(headers['Idempotency-Key']).toBe('sale-whatsapp/row-1');
 expect(JSON.parse(String(init.body))).toMatchObject({to:'255752000000',dispatch:'sync',content:{type:'text'}});
});

it('retries what time or a fix can cure, gives up on what cannot, and never repeats the key',async()=>{
 const err=(status:number,code:string,message='',reason?:string)=>reply(status,{success:false,error:{code,message,...(reason?{details:{reason}}:{})}}) as any;
 const send=(f:any)=>sendWhatsApp({},config,'k',f);
 for(const [f,label] of [
  [err(402,'NO_MESSAGE_CREDITS','You have used all your messages'),'no credits'],
  [err(429,'RATE_LIMITED','Too many requests'),'rate limit'],
  [err(409,'WHATSAPP_NOT_CONNECTED','This account has no connected WhatsApp number.'),'not connected'],
  [err(422,'WHATSAPP_POLICY_BLOCKED','Template not approved','TEMPLATE_NOT_APPROVED'),'pending template'],
  [err(401,'API_KEY_REVOKED','Revoked'),'revoked key'],
  [err(502,'META_API_ERROR','Service temporarily unavailable'),'Meta outage'],
  [err(500,'INTERNAL_ERROR','Something went wrong'),'server error'],
 ] as const){const r=await send(f);expect(r.ok,label).toBe(false);expect((r as any).retryable,label).toBe(true);}
 for(const [f,label] of [
  [err(422,'WHATSAPP_POLICY_BLOCKED','The 24-hour customer service window has closed — send an approved template instead.','SERVICE_WINDOW_CLOSED'),'window closed'],
  [err(422,'WHATSAPP_POLICY_BLOCKED','The contact opted out','OPTED_OUT'),'opted out'],
  [err(422,'VALIDATION_ERROR','to: must be digits'),'bad request'],
  [err(502,'META_API_ERROR','(#132001) Template name does not exist in the translation'),'unknown template'],
 ] as const){const r=await send(f);expect(r.ok,label).toBe(false);expect((r as any).retryable,label).toBe(false);expect((r as any).error,label).not.toContain(KEY);}
 const closed=await send(err(422,'WHATSAPP_POLICY_BLOCKED','The 24-hour customer service window has closed — send an approved template instead.','SERVICE_WINDOW_CLOSED'));
 expect((closed as any).error).toContain('SERVICE_WINDOW_CLOSED');
 const offline=await send((async()=>{throw new TypeError('fetch failed');}) as any);
 expect(offline).toMatchObject({ok:false,retryable:true,status:0});
});

/** Just enough of a database for the outbox: rows in memory, matched by the statement they are written for. */
function fakeDb(){
 const rows:any[]=[];const audits:any[]=[];
 const db={rows,audits,query:async(sql:string,params:any[]=[])=>{
  if(/^(savepoint|release|rollback)/.test(sql.trim()))return {rows:[]};
  if(sql.includes('insert into wifi.notification_outbox')){
   if(!rows.some(r=>r.kind==='SALE_WHATSAPP'&&r.dedupe_key===params[0]))rows.push({id:'row-'+rows.length,kind:'SALE_WHATSAPP',dedupe_key:params[0],recipients:params[1],payload:params[2],status:'PENDING',attempts:0,due:true});
   return {rows:[]};
  }
  if(sql.includes("kind='SALE_WHATSAPP' and status='PENDING'")){
   const row=rows.find(r=>r.status==='PENDING'&&r.due);if(!row)return {rows:[]};
   row.attempts++;row.due=false;return {rows:[{...row}]};
  }
  if(sql.includes('with this as'))return {rows:[{count:3,total:12000}]};
  if(sql.includes("status='SENT'")){Object.assign(rows.find(r=>r.id===params[0]),{status:'SENT',provider_message_id:params[1]});return {rows:[]};}
  if(sql.includes("status='FAILED'")){Object.assign(rows.find(r=>r.id===params[0]),{status:'FAILED',last_error:params[1]});return {rows:[]};}
  if(sql.includes('next_attempt_at=now()+make_interval(mins=>$2)')){Object.assign(rows.find(r=>r.id===params[0]),{last_error:params[2],retry_in:params[1]});return {rows:[]};}
  if(sql.includes('audit'))return audits.push(params),{rows:[]};
  throw new Error('unexpected query: '+sql);
 }};
 return db;
}

const {customer:_masked,...unmasked}=sale;
const paid={...unmasked,phone:'0758342054'};

it('queues one alert per sale and owner number, with the customer masked, however often the provider calls back',async()=>{
 const db=fakeDb();
 const two={...config,to:['255752000000','255699100842']};
 await enqueueSaleWhatsApp(db as any,paid,two);
 await enqueueSaleWhatsApp(db as any,paid,two); // the provider repeats its callback
 expect(db.rows).toHaveLength(2);
 expect(db.rows.map(r=>r.dedupe_key)).toEqual(['sale-1:255752000000','sale-1:255699100842']);
 expect(db.rows[0].payload.customer).toBe('0758 ••• 054');
 expect(JSON.stringify(db.rows)).not.toContain('0758342054');
});

it('queues nothing while the WhatsApp alert is off',async()=>{
 const db=fakeDb();
 await enqueueSaleWhatsApp(db as any,paid,null);
 expect(db.rows).toHaveLength(0);
});

it('sends the alert with the day so far, records the message id, and has nothing more to do',async()=>{
 const db=fakeDb();
 await enqueueSaleWhatsApp(db as any,paid,config);
 let sent:any=null;
 const fetchImpl=(async(_u:string,init:RequestInit)=>{sent=JSON.parse(String(init.body));return reply(201,{success:true,data:{id:'msg-1',waMessageId:'wamid.ABC'}})();}) as any;
 expect(await deliverWhatsAppOne(config,fetchImpl,db as any)).toBe(true);
 expect(sent.to).toBe('255752000000');
 expect(sent.content.text).toContain('Sale #3 today · TZS 12,000 so far');
 expect(db.rows[0]).toMatchObject({status:'SENT',provider_message_id:'wamid.ABC'});
 expect(await deliverWhatsAppOne(config,fetchImpl,db as any)).toBe(false);
});

it('waits out a top-up, and records a send that can never work, once',async()=>{
 const db=fakeDb();
 await enqueueSaleWhatsApp(db as any,paid,config);
 await deliverWhatsAppOne(config,reply(402,{success:false,error:{code:'NO_MESSAGE_CREDITS',message:'You have used all your messages'}}) as any,db as any);
 expect(db.rows[0]).toMatchObject({status:'PENDING',retry_in:2});
 expect(db.rows[0].last_error).toContain('NO_MESSAGE_CREDITS');
 db.rows[0].due=true;
 await deliverWhatsAppOne(config,reply(422,{success:false,error:{code:'WHATSAPP_POLICY_BLOCKED',message:'The 24-hour customer service window has closed — send an approved template instead.',details:{reason:'SERVICE_WINDOW_CLOSED'}}}) as any,db as any);
 expect(db.rows[0].status).toBe('FAILED');
 expect(db.audits).toHaveLength(1);
});

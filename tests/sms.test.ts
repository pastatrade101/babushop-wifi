import {it,expect} from 'vitest';
import {smsConfig,smsNumber,sendSms,renderVoucherSms,toGsm,isGsm,SMS_LIMIT} from '../packages/notifications/src/index.ts';
import {enqueueVoucherSms,deliverSmsOne} from '../packages/database/src/notifications.ts';
import {encrypt} from '../packages/database/src/crypto.ts';

const config={token:'test-token',baseUrl:'https://mosms.test/api'};
const reply=(status:number,body:unknown)=>async()=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

it('stays off until a MoSMS token is set, and points at mosms.co.tz by default',()=>{
 expect(smsConfig({})).toBeNull();
 expect(smsConfig({MOSMS_TOKEN:'  '})).toBeNull();
 expect(smsConfig({MOSMS_TOKEN:'1|abc'})).toEqual({token:'1|abc',baseUrl:'https://mosms.co.tz/api'});
 expect(smsConfig({MOSMS_TOKEN:'1|abc',MOSMS_BASE_URL:'https://example.test/api/'})?.baseUrl).toBe('https://example.test/api');
});

it('accepts the ways buyers type a Tanzanian mobile number, and nothing else',()=>{
 for(const [input,out] of [['0758342054','255758342054'],['255699100842','255699100842'],['+255 712 345 678','255712345678'],['712345678','255712345678']])expect(smsNumber(input),input).toBe(out);
 for(const bad of [null,'','12345','0222123456','25575834205','not a number'])expect(smsNumber(bad as any),String(bad)).toBeNull();
});

it('posts one message with the token and reports the MoSMS message id',async()=>{
 let seen:{url:string;init:RequestInit}|null=null;
 const fetchImpl=(async(url:string,init:RequestInit)=>{seen={url,init};return reply(201,{data:{id:1042,status:'PENDING_ACCEPTED'}})();}) as any;
 expect(await sendSms('255758342054','Habari',config,fetchImpl)).toEqual({ok:true,id:'1042'});
 expect(seen!.url).toBe('https://mosms.test/api/sms/send');
 expect((seen!.init.headers as Record<string,string>).Authorization).toBe('Bearer test-token');
 expect(JSON.parse(String(seen!.init.body))).toEqual({to:'255758342054',text:'Habari'});
});

it('retries what a top-up, a fixed token or time can fix, and gives up on a bad number',async()=>{
 const noCredit=await sendSms('255758342054','x',config,reply(422,{message:'Insufficient SMS balance.',balance:0,required:1}) as any);
 expect(noCredit).toMatchObject({ok:false,retryable:true,status:422});
 const badNumber=await sendSms('255758342054','x',config,reply(422,{message:'The given data was invalid.',errors:{to:['The to field is invalid.']}}) as any);
 expect(badNumber).toMatchObject({ok:false,retryable:false,status:422,error:'The to field is invalid.'});
 for(const status of [401,403,429,500,502])expect(await sendSms('255758342054','x',config,reply(status,{message:'no'}) as any),String(status)).toMatchObject({ok:false,retryable:true});
 const offline=await sendSms('255758342054','x',config,(async()=>{throw new TypeError('fetch failed');}) as any);
 expect(offline).toMatchObject({ok:false,retryable:true,status:0});
 expect(JSON.stringify(offline)).not.toContain('test-token');
});

it('fits the voucher text in one plain SMS, with the code and instruction always whole',()=>{
 const text=renderVoucherSms({brand:'JIACHIE WIFI',code:'LPX9-R5Y3-Z2JQ-224U',packageName:'JIACHIE KWA SIKU',sellerPhone:'0758342054'});
 expect(text).toBe('JIACHIE WIFI: Malipo yamepokelewa. Vocha yako: LPX9-R5Y3-Z2JQ-224U (JIACHIE KWA SIKU). Iweke kwenye ukurasa wa Wi-Fi kuunganisha. Msaada: 0758342054');
 expect(text.length).toBeLessThanOrEqual(SMS_LIMIT);expect(isGsm(text)).toBe(true);
 const long=renderVoucherSms({brand:'JIACHIE WIFI',code:'LPX9-R5Y3-Z2JQ-224U',packageName:'Kifurushi cha mwezi mzima chenye kasi ya juu kabisa kwa familia nzima',sellerPhone:'0758342054'});
 expect(long.length).toBeLessThanOrEqual(SMS_LIMIT);expect(long).toContain('LPX9-R5Y3-Z2JQ-224U');expect(long).toContain('kuunganisha.');expect(long).toContain('...');
 // Shop text with curly quotes or emoji would make the SMS Unicode and cost two or three credits.
 const fancy=renderVoucherSms({brand:'JIACHIE WIFI ✨',code:'LPX9-R5Y3-Z2JQ-224U',packageName:'Siku “moja” – 24h 🚀'});
 expect(isGsm(fancy)).toBe(true);expect(fancy).toContain('(Siku "moja" - 24h)');
 const huge=renderVoucherSms({brand:'X'.repeat(200),code:'LPX9-R5Y3-Z2JQ-224U',packageName:'Y'.repeat(200),sellerPhone:'0758342054'});
 expect(huge.length).toBeLessThanOrEqual(SMS_LIMIT);expect(huge).toContain('LPX9-R5Y3-Z2JQ-224U');
 expect(toGsm('a\n\tb  c')).toBe('a b c');
});

/** Just enough of a database for the outbox: rows in memory, matched by the statement they are written for. */
function fakeDb(code:string|null){
 const rows:any[]=[];const audits:any[]=[];
 const db={rows,audits,query:async(sql:string,params:any[]=[])=>{
  if(/^(savepoint|release|rollback)/.test(sql.trim()))return {rows:[]};
  if(sql.includes('insert into wifi.notification_outbox')){
   if(!rows.some(r=>r.kind==='VOUCHER_SMS'&&r.dedupe_key===params[0]))rows.push({id:'row-'+rows.length,kind:'VOUCHER_SMS',dedupe_key:params[0],recipients:params[1],payload:params[2],status:'PENDING',attempts:0,due:true});
   return {rows:[]};
  }
  if(sql.includes("kind='VOUCHER_SMS' and status='PENDING'")){
   const row=rows.find(r=>r.status==='PENDING'&&r.due);if(!row)return {rows:[]};
   row.attempts++;row.due=false;return {rows:[{...row}]};
  }
  if(sql.includes('from wifi.manual_sale_items'))return {rows:code===null?[]:[{code_encrypted:code==='damaged'?'bm90IGEgY29kZQ==':encrypt(code),package_name:'JIACHIE KWA SIKU'}]};
  if(sql.includes("status='SENT'")){Object.assign(rows.find(r=>r.id===params[0]),{status:'SENT',provider_message_id:params[1]});return {rows:[]};}
  if(sql.includes("status='FAILED'")){Object.assign(rows.find(r=>r.id===params[0]),{status:'FAILED',last_error:params[1]});return {rows:[]};}
  if(sql.includes('next_attempt_at=now()+make_interval(mins=>$2)')){Object.assign(rows.find(r=>r.id===params[0]),{last_error:params[2],retry_in:params[1]});return {rows:[]};}
  if(sql.includes('audit'))return audits.push(params),{rows:[]};
  throw new Error('unexpected query: '+sql);
 }};
 return db;
}

it('queues one SMS per sale with the number and sale id but never the code, and sends the code only at delivery',async()=>{
 const db=fakeDb('LPX9R5Y3Z2JQ224U');
 await enqueueVoucherSms(db as any,{saleId:'sale-1',phone:'0699100842'},config);
 await enqueueVoucherSms(db as any,{saleId:'sale-1',phone:'0699100842'},config); // the provider repeats its callback
 expect(db.rows).toHaveLength(1);
 expect(db.rows[0]).toMatchObject({recipients:['255699100842'],payload:{saleId:'sale-1'}});
 expect(JSON.stringify(db.rows[0])).not.toContain('LPX9');
 let sent:any=null;
 const fetchImpl=(async(_url:string,init:RequestInit)=>{sent=JSON.parse(String(init.body));return reply(201,{data:{id:7}})();}) as any;
 expect(await deliverSmsOne(config,fetchImpl,db as any)).toBe(true);
 expect(sent.to).toBe('255699100842');expect(sent.text).toContain('LPX9-R5Y3-Z2JQ-224U');
 expect(db.rows[0]).toMatchObject({status:'SENT',provider_message_id:'7'});
 expect(JSON.stringify(db.rows[0])).not.toContain('LPX9');
 expect(await deliverSmsOne(config,fetchImpl,db as any)).toBe(false);
});

it('queues nothing while SMS is off or the number cannot take an SMS',async()=>{
 const db=fakeDb('LPX9R5Y3Z2JQ224U');
 await enqueueVoucherSms(db as any,{saleId:'sale-1',phone:'0699100842'},null);
 await enqueueVoucherSms(db as any,{saleId:'sale-2',phone:null},config);
 await enqueueVoucherSms(db as any,{saleId:'sale-3',phone:'12345'},config);
 expect(db.rows).toHaveLength(0);
});

it('waits and retries an empty balance, and records a send that can never work',async()=>{
 const db=fakeDb('LPX9R5Y3Z2JQ224U');
 await enqueueVoucherSms(db as any,{saleId:'sale-1',phone:'0699100842'},config);
 await deliverSmsOne(config,reply(422,{message:'Insufficient SMS balance.',balance:0,required:1}) as any,db as any);
 expect(db.rows[0]).toMatchObject({status:'PENDING',retry_in:2,last_error:'Insufficient SMS balance.'});
 db.rows[0].due=true;
 await deliverSmsOne(config,reply(422,{message:'invalid',errors:{to:['The to field is invalid.']}}) as any,db as any);
 expect(db.rows[0]).toMatchObject({status:'FAILED',last_error:'The to field is invalid.'});
 expect(db.audits).toHaveLength(1);
});

it('marks an SMS failed, once, when the voucher code cannot be read, instead of retrying it for ever',async()=>{
 const db=fakeDb('damaged');
 await enqueueVoucherSms(db as any,{saleId:'sale-1',phone:'0699100842'},config);
 let calls=0;
 expect(await deliverSmsOne(config,(async()=>{calls++;return reply(201,{data:{id:1}})();}) as any,db as any)).toBe(true);
 expect(calls).toBe(0);
 expect(db.rows[0]).toMatchObject({status:'FAILED',last_error:'Could not read the voucher code'});
 expect(db.audits).toHaveLength(1);
});

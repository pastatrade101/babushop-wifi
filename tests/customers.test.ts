import {it,expect} from 'vitest';
import {smsSegments,MAX_SMS_SEGMENTS} from '../packages/database/src/customers.ts';
import {deliverCustomSmsOne} from '../packages/database/src/notifications.ts';

const config={token:'test-token',baseUrl:'https://mosms.test/api'};
const reply=(status:number,body:unknown)=>async()=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

it('counts SMS the way they are billed: 160 plain characters, 153 per part, 70 with any other character',()=>{
 expect(smsSegments('')).toMatchObject({segments:0});
 expect(smsSegments('a'.repeat(160))).toMatchObject({plain:true,segments:1});
 expect(smsSegments('a'.repeat(161))).toMatchObject({segments:2});
 expect(smsSegments('a'.repeat(306))).toMatchObject({segments:2});
 expect(smsSegments('a'.repeat(307))).toMatchObject({segments:3});
 expect(smsSegments('Karibu “JIACHIE”')).toMatchObject({plain:false,segments:1});
 expect(smsSegments('😀'.repeat(71))).toMatchObject({plain:false,segments:2});
 expect(MAX_SMS_SEGMENTS).toBe(3);
});

/** The outbox and campaign rows custom SMS delivery reads and writes. */
function fakeDb(optedOut:boolean|null){
 const row={id:'row-1',kind:'CUSTOM_SMS',recipients:['255752093014'],payload:{campaignId:'c-1'},status:'PENDING',attempts:0,due:true} as any;
 const db={row,query:async(sql:string,params:any[]=[])=>{
  if(sql.includes("kind='CUSTOM_SMS' and status='PENDING'")){if(!row.due||row.status!=='PENDING')return {rows:[]};row.due=false;row.attempts++;return {rows:[{...row}]};}
  if(sql.includes('from wifi.sms_campaigns'))return {rows:[{text:'JIACHIE WIFI: Ofa ya leo!',opted_out:optedOut}]};
  if(sql.includes("status='SENT'")){Object.assign(row,{status:'SENT',provider_message_id:params[1]});return {rows:[]};}
  if(sql.includes("status='FAILED'")){Object.assign(row,{status:'FAILED',last_error:params[1]});return {rows:[]};}
  if(sql.includes('make_interval(mins=>$2)')){Object.assign(row,{retry_in:params[1],last_error:params[2]});return {rows:[]};}
  throw new Error('unexpected query: '+sql);
 }};
 return db;
}

it('sends a queued custom SMS with its campaign text',async()=>{
 const db=fakeDb(false);let sent:any=null;
 const fetchImpl=(async(_u:string,init:RequestInit)=>{sent=JSON.parse(String(init.body));return reply(201,{data:{id:77}})();}) as any;
 expect(await deliverCustomSmsOne(config,fetchImpl,db as any)).toBe(true);
 expect(sent).toEqual({to:'255752093014',text:'JIACHIE WIFI: Ofa ya leo!'});
 expect(db.row).toMatchObject({status:'SENT',provider_message_id:'77'});
 expect(await deliverCustomSmsOne(config,fetchImpl,db as any)).toBe(false);
});

it('skips someone who asked for no SMS after it was queued, without texting them',async()=>{
 const db=fakeDb(true);let calls=0;
 await deliverCustomSmsOne(config,(async()=>{calls++;return reply(201,{data:{id:1}})();}) as any,db as any);
 expect(calls).toBe(0);
 expect(db.row).toMatchObject({status:'FAILED',last_error:'Asked for no SMS'});
});

it('retries an empty balance later instead of dropping the message',async()=>{
 const db=fakeDb(null);
 await deliverCustomSmsOne(config,reply(422,{message:'Insufficient SMS balance.',balance:0,required:1}) as any,db as any);
 expect(db.row).toMatchObject({status:'PENDING',retry_in:2});
});

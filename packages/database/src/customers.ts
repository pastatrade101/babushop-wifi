import {pool,tx,audit,requireValue,SITE,type DB,type Staff} from './index.ts';
import {smsConfig,smsNumber,smsBalance,isGsm} from '../../notifications/src/index.ts';

// Wi-Fi users: everyone the shop has a phone number for, from mobile payments
// (bought, or tried) and cash sales, plus people added by hand. The shop can
// name them, keep a note, mark "no SMS", and text them through MoSMS.

export type CustomerFilter='all'|'bought'|'tried'|'online';

/** One SMS segment carries 160 plain characters (153 when split) or 70 with any other character (67 when split). */
export function smsSegments(text:string){
 const plain=isGsm(text),n=[...text].length;
 const single=plain?160:70,part=plain?153:67;
 return {plain,length:n,segments:n===0?0:n<=single?1:Math.ceil(n/part)};
}
export const MAX_SMS_SEGMENTS=3;

export async function listCustomers(input:{q?:string;filter?:CustomerFilter}={}){
 const q=(input.q||'').trim(),digits=q.replace(/\D/g,'');
 const {rows}=await pool.query(`with events as (
   select wifi.tz_msisdn(customer_phone) phone,(status='PAID') paid,amount_tzs::float8 amount,coalesce(paid_at,created_at) at,network
    from wifi.payment_intents where site_id=$1
   union all
   select wifi.tz_msisdn(m.customer_phone),true,m.total_tzs::float8,m.created_at,'cash'
    from wifi.manual_sales m where m.site_id=$1 and m.channel<>'SELF_SERVICE' and not exists(select 1 from wifi.sale_reversals r where r.sale_id=m.id)
  ),stats as (
   select phone,count(*) filter (where paid)::int purchases,coalesce(sum(amount) filter (where paid),0)::float8 spent_tzs,
    count(*)::int attempts,max(at) last_at,min(at) first_at,(array_agg(network order by at desc))[1] network
   from events where phone is not null group by phone
  )
  select coalesce(c.phone,s.phone) phone,c.name,c.note,coalesce(c.sms_opt_out,false) sms_opt_out,
   coalesce(s.purchases,0) purchases,coalesce(s.spent_tzs,0) spent_tzs,coalesce(s.attempts,0) attempts,s.last_at,s.first_at,s.network,c.created_at added_at
  from stats s full outer join (select * from wifi.customers where site_id=$1) c on c.phone=s.phone
  where ($2='' or c.name ilike '%'||$2||'%' or c.note ilike '%'||$2||'%' or ($3<>'' and coalesce(c.phone,s.phone) like '%'||$3||'%'))
  order by coalesce(s.last_at,c.created_at) desc nulls last limit 1000`,[SITE,q,digits.startsWith('0')?digits.slice(1):digits]);
 // Online now: a voucher session the router reported in the last three minutes and has not
 // ended (the Wi-Fi sessions page's rule), traced back through the sale to the buyer's number.
 const online=new Set((await pool.query(`select distinct coalesce(wifi.tz_msisdn(pi.customer_phone),wifi.tz_msisdn(ms.customer_phone)) phone
   from wifi.network_sessions ns
   join wifi.access_grants g on g.id=ns.grant_id
   join wifi.manual_sale_items i on i.voucher_id=g.voucher_id
   join wifi.manual_sales ms on ms.id=i.sale_id and ms.site_id=$1
   left join wifi.payment_intents pi on pi.sale_id=ms.id
  where ns.stopped_at is null and ns.last_seen_at>now()-interval '3 minutes'`,[SITE])).rows.map(r=>r.phone).filter(Boolean));
 // One query, four views: the counts for each tab come with whichever list is shown.
 const counts={all:rows.length,bought:rows.filter(r=>r.purchases>0).length,tried:rows.filter(r=>r.purchases===0).length,online:rows.filter(r=>online.has(r.phone)).length};
 const filter=input.filter||'all';
 const keep=(r:any)=>filter==='all'||(filter==='online'?online.has(r.phone):filter==='bought'?r.purchases>0:r.purchases===0);
 const shown=rows.filter(keep).slice(0,500);
 const iso=(d:Date|null)=>d?new Date(d).toISOString():null;
 const config=smsConfig();
 return {
  counts,
  items:shown.map(r=>({phone:r.phone,online:online.has(r.phone),name:r.name,note:r.note,sms_opt_out:r.sms_opt_out,purchases:r.purchases,spent_tzs:Number(r.spent_tzs),attempts:r.attempts,last_at:iso(r.last_at),first_at:iso(r.first_at),network:r.network,added_at:iso(r.added_at)})),
  sms:{enabled:!!config,balance:config?await smsBalance(config).catch(()=>null):null},
  campaigns:(await pool.query(`select c.id,c.text,c.recipients,c.created_at,s.display_name sent_by,
    (select count(*) from wifi.notification_outbox o where o.kind='CUSTOM_SMS' and o.dedupe_key like c.id::text||':%' and o.status='SENT')::int sent,
    (select count(*) from wifi.notification_outbox o where o.kind='CUSTOM_SMS' and o.dedupe_key like c.id::text||':%' and o.status='FAILED')::int failed
   from wifi.sms_campaigns c left join wifi.staff_profiles s on s.id=c.created_by where c.site_id=$1 order by c.created_at desc limit 5`,[SITE])).rows
   .map(c=>({id:c.id,text:c.text,recipients:c.recipients,sent:c.sent,failed:c.failed,sent_by:c.sent_by,created_at:iso(c.created_at)})),
 };
}

/** Add someone, or change their name, note or SMS choice. Their phone number is who they are. */
export async function saveCustomer(staff:Staff,input:{phone:string;name?:string|null;note?:string|null;sms_opt_out?:boolean}){
 const phone=smsNumber(input.phone);
 requireValue(phone,400,'Enter a Tanzanian mobile number, like 0752 093 014.');
 const name=input.name?.trim()||null,note=input.note?.trim()||null;
 requireValue(!name||name.length<=80,400,'Keep the name under 80 characters.');
 requireValue(!note||note.length<=300,400,'Keep the note under 300 characters.');
 const row=(await pool.query(`insert into wifi.customers(site_id,phone,name,note,sms_opt_out,created_by) values($1,$2,$3,$4,$5,$6)
  on conflict (site_id,phone) do update set name=excluded.name,note=excluded.note,sms_opt_out=excluded.sms_opt_out,updated_at=now()
  returning phone,name,note,sms_opt_out`,[SITE,phone,name,note,!!input.sms_opt_out,staff.id])).rows[0];
 await audit(pool,staff.id,'CUSTOMER_SAVED',null,{phone,name,sms_opt_out:row.sms_opt_out});
 return row;
}

/**
 * Queue one custom SMS per chosen number, skipping anyone marked "no SMS".
 * The worker sends them; the campaign keeps the text and who sent it.
 */
export async function sendCustomSms(staff:Staff,input:{phones:string[];text:string}){
 requireValue(smsConfig(),503,'SMS is not set up: add MOSMS_TOKEN on the server.');
 const text=String(input.text||'').replace(/\r\n/g,'\n').trim();
 requireValue(text.length>0,400,'Write the message first.');
 const {segments}=smsSegments(text);
 requireValue(segments<=MAX_SMS_SEGMENTS,400,`That message needs ${segments} SMS each; keep it to ${MAX_SMS_SEGMENTS} or fewer.`);
 const wanted=[...new Set((input.phones||[]).map(p=>smsNumber(p)).filter((p):p is string=>!!p))];
 requireValue(wanted.length>0,400,'Choose at least one person.');
 requireValue(wanted.length<=500,400,'Send to at most 500 people at a time.');
 return tx(async (db:DB)=>{
  const out=new Set((await db.query('select phone from wifi.customers where site_id=$1 and sms_opt_out and phone=any($2)',[SITE,wanted])).rows.map(r=>r.phone));
  const to=wanted.filter(p=>!out.has(p));
  requireValue(to.length>0,400,'Everyone chosen has asked for no SMS.');
  const campaign=(await db.query('insert into wifi.sms_campaigns(site_id,text,recipients,created_by) values($1,$2,$3,$4) returning id',[SITE,text,to.length,staff.id])).rows[0].id as string;
  for(const phone of to)await db.query(`insert into wifi.notification_outbox(kind,dedupe_key,recipients,payload) values('CUSTOM_SMS',$1,$2,$3)`,[`${campaign}:${phone}`,[phone],{campaignId:campaign}]);
  await audit(db,staff.id,'CUSTOM_SMS_QUEUED',campaign,{recipients:to.length,skipped_no_sms:out.size,segments});
  return {campaign_id:campaign,queued:to.length,skipped:out.size,segments,credits:to.length*segments};
 });
}


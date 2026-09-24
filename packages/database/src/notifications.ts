import {pool,audit,SITE,type DB} from './index.ts';
import {emailConfig,sendEmail,renderSalePaid,maskPhone,type EmailConfig,type SalePaid} from '../../notifications/src/index.ts';

// Owner alerts go through an outbox. The row is written inside the same
// transaction that records the sale, so an email exists exactly when a sale
// does; the worker delivers it afterwards. That keeps Resend out of the payment
// path entirely: a slow or failing mail service can delay an email, never a
// voucher.

const MAX_ATTEMPTS=8;
const LEASE_MINUTES=5;

/**
 * Queue the "new sale" email. Runs inside settle()'s transaction, fenced by a
 * savepoint so that whatever goes wrong here -- a missing table on a half
 * migrated database, a bad value -- the payment still commits.
 *
 * Nothing is queued while email is not configured, so adding a key later does
 * not release a backlog of alerts for sales that happened before it.
 */
export async function enqueueSalePaid(db:DB,sale:Omit<SalePaid,'customer'>&{phone:string|null},config:EmailConfig|null=emailConfig()){
 if(!config)return;
 const {phone,...rest}=sale;
 const payload:SalePaid={...rest,customer:maskPhone(phone)};
 await db.query('savepoint sale_alert');
 try{
  // One email per sale, however many times the provider repeats its callback.
  await db.query(`insert into wifi.notification_outbox(kind,dedupe_key,recipients,payload) values('SALE_PAID',$1,$2,$3)
   on conflict (kind,dedupe_key) do nothing`,[sale.saleId,config.to,payload]);
  await db.query('release savepoint sale_alert');
 }catch{
  await db.query('rollback to savepoint sale_alert');
  console.error('Could not queue the sale email; the sale itself is recorded.');
 }
}

/** Sales count and takings so far today, up to and including this sale, so a retried email says the same thing. */
async function today(db:DB,saleId:string){
 const row=(await db.query(`with this as (select created_at from wifi.manual_sales where id=$1)
  select count(*)::int count,coalesce(sum(s.total_tzs),0)::float8 total from wifi.manual_sales s,this
  where s.site_id=$2 and s.channel='SELF_SERVICE'
   and s.created_at>=(date_trunc('day',this.created_at at time zone 'Africa/Dar_es_Salaam') at time zone 'Africa/Dar_es_Salaam')
   and s.created_at<=this.created_at`,[saleId,SITE])).rows[0];
 return {todayCount:row?.count||1,todayTotalTzs:row?.total||0};
}

/**
 * Send at most one due email. Returns true when a row was taken, so the worker
 * can drain a queue without sleeping between each.
 *
 * The row is leased by pushing its next attempt into the future before sending,
 * so a second worker skips it and a worker that dies mid-send hands it back
 * after the lease. Resend's idempotency key covers the one gap that leaves: a
 * send that succeeded but was never recorded is not delivered twice.
 */
export async function deliverOne(config:EmailConfig|null=emailConfig(),fetchImpl:typeof fetch=fetch,db:DB=pool):Promise<boolean>{
 if(!config)return false;
 const row=(await db.query(`update wifi.notification_outbox set attempts=attempts+1,next_attempt_at=now()+make_interval(mins=>$1)
  where id=(select id from wifi.notification_outbox where status='PENDING' and next_attempt_at<=now() order by next_attempt_at limit 1 for update skip locked)
  returning *`,[LEASE_MINUTES])).rows[0];
 if(!row)return false;
 const sale=row.payload as SalePaid;
 const origin=(process.env.APP_ORIGIN||'').replace(/\/+$/,'');
 const email=renderSalePaid(sale,{
  brand:process.env.WIFI_BRAND||'JIACHIE WIFI',
  portalUrl:`${origin}/payments?q=${encodeURIComponent(sale.reference)}`,
  ...await today(db,sale.saleId),
 });
 const result=await sendEmail({from:config.from,to:row.recipients,...email,idempotencyKey:'sale-paid/'+row.id},config.apiKey,fetchImpl);
 if(result.ok){
  await db.query("update wifi.notification_outbox set status='SENT',sent_at=now(),provider_message_id=$2,last_error=null where id=$1",[row.id,result.id]);
  return true;
 }
 if(result.retryable&&row.attempts<MAX_ATTEMPTS){
  // 2, 4, 8 ... minutes, capped at two hours: rides out a Resend outage without hammering it.
  await db.query('update wifi.notification_outbox set next_attempt_at=now()+make_interval(mins=>$2),last_error=$3 where id=$1',
   [row.id,Math.min(2**row.attempts,120),result.error]);
  return true;
 }
 await db.query("update wifi.notification_outbox set status='FAILED',last_error=$2 where id=$1",[row.id,result.error]);
 await audit(db,null,'NOTIFICATION_FAILED',row.id,{kind:row.kind,sale_id:sale.saleId,status:result.status,error:result.error});
 console.error(`Sale email for ${sale.receipt} was not delivered: ${result.error}`);
 return true;
}

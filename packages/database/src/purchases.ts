import {randomUUID} from 'node:crypto';
import {pool,tx,audit,requireValue,Problem,SITE} from './index.ts';
import {digest,decrypt,present,token} from './crypto.ts';
import {paymentProvider,webhookUrl,callbackShape} from '../../payments/src/index.ts';

// Self-service voucher purchase by mobile money, alongside the cash counter.
//
// The ordering matters and is deliberate: stock is RESERVED when checkout
// starts and only marked SOLD when the provider confirms payment. An abandoned
// or failed checkout therefore returns the voucher to stock when the
// reservation lapses, and a voucher is never consumed by a payment that never
// arrived. The inventory trigger forbids SOLD -> AVAILABLE, so selling early
// would permanently burn stock.
//
// The code itself never travels in a URL, an email or a webhook. The buyer
// holds an opaque claim token; only its HMAC digest is stored, and the code is
// returned over POST once the intent is PAID.

const HOLD_MINUTES=15;

/** Packages a customer may buy right now: active, priced, and actually in stock. */
export async function catalogue(){
 const rows=(await pool.query(`select p.id,p.name,p.description,p.price_tzs,p.duration_minutes,p.download_mbps,p.upload_mbps,
  (select count(*)::int from wifi.vouchers v where v.package_id=p.id and v.inventory_state='AVAILABLE' and (v.reserved_until is null or v.reserved_until<now())) available
  from wifi.packages p where p.site_id=$1 and p.active order by p.price_tzs`,[SITE])).rows;
 return {items:rows.filter(r=>r.available>0).map(({available,...r})=>({...r,in_stock:available>0}))};
}

/**
 * Reserve one voucher and open a hosted checkout. Returns the claim token to
 * the buyer's browser only -- it is the sole way to retrieve the code later.
 */
export async function start(input:{package_id:string;phone?:string;network?:string}){
 const provider=paymentProvider();
 requireValue(provider,503,'Mobile payment is unavailable right now. Please pay the attendant.');
 const claim=token(),reference='JW-'+randomUUID().toUpperCase();
 // Reserve first, in its own transaction: never call a payment provider while
 // holding row locks on stock.
 const intent=await tx(async db=>{
  const voucher=(await db.query(`select v.* from wifi.vouchers v join wifi.packages p on p.id=v.package_id
   where v.package_id=$1 and p.active and p.site_id=$2 and v.inventory_state='AVAILABLE'
     and (v.reserved_until is null or v.reserved_until<now())
   order by v.created_at,v.id limit 1 for update of v skip locked`,[input.package_id,SITE])).rows[0];
  requireValue(voucher,409,'That package is sold out. Choose another or ask the attendant.');
  const reservation=(await db.query(`insert into wifi.sale_reservations(staff_id,channel,expires_at)
   values(null,'SELF_SERVICE',now()+($1||' minutes')::interval) returning *`,[String(HOLD_MINUTES)])).rows[0];
  await db.query('update wifi.vouchers set reservation_id=$1,reserved_until=$2 where id=$3',[reservation.id,reservation.expires_at,voucher.id]);
  return (await db.query(`insert into wifi.payment_intents(site_id,package_id,reservation_id,provider,network,reference,amount_tzs,customer_phone,claim_digest,expires_at)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
   [SITE,voucher.package_id,reservation.id,provider!.name,input.network||null,reference,voucher.price_tzs,input.phone||null,digest(claim,'PORTAL_CONTEXT_SECRET'),reservation.expires_at])).rows[0];
 });
 let checkout;
 try{
  checkout=await provider!.createCheckout({
   amount:intent.amount_tzs,currency:'TZS',
   description:(process.env.WIFI_BRAND||'WIFI')+' voucher',
   reference,customer:{phone:input.phone},network:input.network,
   returnUrl:(process.env.APP_ORIGIN||'')+'/buy/done',webhookUrl:webhookUrl(provider!.name)
  });
 }catch(error){
  // Record what the provider actually said before the message is flattened into
  // something safe for the buyer. Without this a failed checkout leaves nothing
  // anyone can act on.
  const detail=provider!.lastFailure?.()??null;
  await audit(pool,null,'PURCHASE_CHECKOUT_FAILED',intent.id,{provider:provider!.name,reference,detail}).catch(()=>{});
  // Release the hold immediately rather than leaving stock parked for 15 minutes.
  await release(intent.id,'Checkout could not be opened').catch(()=>{});
  throw error;
 }
 await pool.query('update wifi.payment_intents set provider_reference=$2,checkout_url=$3,updated_at=now() where id=$1',[intent.id,checkout.reference,checkout.checkout_url]);
 return {reference,claim_token:claim,checkout_url:checkout.checkout_url,flow:checkout.flow,instruction:checkout.instruction,amount_tzs:intent.amount_tzs,expires_at:intent.expires_at};
}

/** Mark an unpaid intent failed and free its reservation. */
async function release(intentId:string,reason:string){
 return tx(async db=>{
  const intent=(await db.query("select * from wifi.payment_intents where id=$1 and status='PENDING' for update",[intentId])).rows[0];
  if(!intent)return null;
  await db.query('update wifi.vouchers set reservation_id=null,reserved_until=null where reservation_id=$1',[intent.reservation_id]);
  await db.query("update wifi.payment_intents set status='FAILED',failure_reason=$2,updated_at=now() where id=$1",[intentId,reason.slice(0,200)]);
  return intent;
 });
}

/**
 * Settle a confirmed payment: mark the voucher SOLD and write the sale record,
 * in one transaction. Safe to call repeatedly -- a settled intent returns its
 * existing sale rather than issuing a second voucher.
 */
async function settle(intentId:string){
 return tx(async db=>{
  const intent=(await db.query('select * from wifi.payment_intents where id=$1 for update',[intentId])).rows[0];
  requireValue(intent,404,'Purchase not found');
  if(intent.status==='PAID')return intent;
  const voucher=(await db.query("select * from wifi.vouchers where reservation_id=$1 and inventory_state='AVAILABLE' for update",[intent.reservation_id])).rows[0];
  if(!voucher){
   // Paid, but the hold lapsed and the voucher went elsewhere. Do not silently
   // keep the money: flag it for a staff refund and say so on the status page.
   await db.query("update wifi.payment_intents set status='REFUND_DUE',paid_at=now(),failure_reason='Stock was no longer held when payment confirmed',updated_at=now() where id=$1",[intentId]);
   await audit(db,null,'PURCHASE_REFUND_DUE',intentId,{reference:intent.reference,amount_tzs:intent.amount_tzs});
   return (await db.query('select * from wifi.payment_intents where id=$1',[intentId])).rows[0];
  }
  const sale=(await db.query(`insert into wifi.manual_sales(receipt_number,cashier_id,site_id,reservation_id,total_tzs,payment_method,channel,customer_phone)
   values($1,null,$2,$3,$4,'MOBILE','SELF_SERVICE',$5) returning *`,
   ['JW-'+randomUUID().toUpperCase(),SITE,intent.reservation_id,voucher.price_tzs,intent.customer_phone])).rows[0];
  await db.query('insert into wifi.manual_sale_items(sale_id,voucher_id,package_name,price_tzs,duration_minutes,download_mbps,upload_mbps) values($1,$2,$3,$4,$5,$6,$7)',
   [sale.id,voucher.id,voucher.package_name,voucher.price_tzs,voucher.duration_minutes,voucher.download_mbps,voucher.upload_mbps]);
  await db.query("update wifi.vouchers set inventory_state='SOLD',sold_at=now(),reserved_until=null where id=$1",[voucher.id]);
  await db.query("update wifi.payment_intents set status='PAID',paid_at=now(),sale_id=$2,updated_at=now() where id=$1",[intentId,sale.id]);
  await audit(db,null,'SELF_SERVICE_SALE',sale.id,{reference:intent.reference,total_tzs:sale.total_tzs});
  return (await db.query('select * from wifi.payment_intents where id=$1',[intentId])).rows[0];
 });
}

/** Verified provider callback. Records the event, then settles or releases. */
export async function webhook(rawBody:Buffer|string,headers:Record<string,string|undefined>){
 const provider=paymentProvider();
 requireValue(provider,503,'Payments are not configured');
 if(!provider!.verifyWebhook(rawBody,headers)){
  // A refused callback is otherwise a dead end: nothing is recorded, and the
  // first live test tells you only that it failed. The field names alone say
  // whether the provider signed it, and carry none of the buyer's data.
  await audit(pool,null,'PAYMENT_CALLBACK_REJECTED',null,{provider:provider!.name,shape:callbackShape(rawBody,headers)}).catch(()=>{});
  throw new Problem(401,'Invalid signature');
 }
 const event=provider!.parseEvent(JSON.parse(Buffer.isBuffer(rawBody)?rawBody.toString('utf8'):String(rawBody)));
 // Match on our own reference first -- Snippe quotes a transaction reference on
 // the event that matches neither the session reference it returned nor the one
 // we sent, so metadata is the only dependable link. The other two are kept as
 // fallbacks for providers that do echo a reference we already hold.
 const intent=(await pool.query('select * from wifi.payment_intents where provider=$1 and (reference=$2 or reference=$3 or provider_reference=$3)',[provider!.name,event.ownReference,event.reference])).rows[0];
 // Record first, so an unrecognised or duplicate event still leaves a trail.
 const recorded=(await pool.query(`insert into wifi.payment_events(intent_id,provider,event_id,event_type,status,payload)
  values($1,$2,$3,$4,$5,$6) on conflict (provider,event_id) do nothing returning id`,
  [intent?.id||null,provider!.name,event.id,event.type,event.status,event.raw as object])).rows[0];
 if(!recorded)return {ok:true};              // Replay: already handled.
 if(!intent)return {ok:true};                // Not ours; stored for audit only.
 if(provider!.isPaid(event.status)){
  // Never trust the callback's amount over our own record.
  requireValue(event.amount===null||Math.round(event.amount)===intent.amount_tzs,400,'Amount does not match the purchase');
  // A provider that does not sign its callbacks gets confirmed against the
  // provider itself before a voucher moves. Anyone can POST this endpoint;
  // only the provider can answer for the transaction.
  if(provider!.confirmsOutOfBand){
   const confirmed=await provider!.fetchStatus(intent.provider_reference||event.reference);
   if(!confirmed?.paid){
    await audit(pool,null,'PAYMENT_CALLBACK_UNCONFIRMED',intent.id,{reference:intent.reference,claimed:event.status,confirmed:confirmed?.status??'no answer'});
    return {ok:true};
   }
  }
  await settle(intent.id);
 }else if(provider!.isFailure(event.status)&&intent.status==='PENDING'){
  await release(intent.id,event.failureReason||('Payment '+event.status));
 }
 return {ok:true};
}

/**
 * Buyer-facing status. Reveals the code only on a PAID intent presenting the
 * correct claim token. Falls back to asking the provider directly, so a lost
 * or delayed webhook never strands someone who has already paid.
 */
export async function status(claimToken:string){
 const intent=(await pool.query('select * from wifi.payment_intents where claim_digest=$1',[digest(claimToken,'PORTAL_CONTEXT_SECRET')])).rows[0];
 requireValue(intent,404,'Purchase not found. Check the link or ask the attendant.');
 let current=intent;
 if(current.status==='PENDING'){
  const provider=paymentProvider();
  const live=provider?await provider.fetchStatus(current.provider_reference||current.reference):null;
  // Release on a definitive provider failure rather than waiting out the hold:
  // a cancelled payment should return the voucher to stock immediately.
  if(live?.paid)current=await settle(current.id);
  else if(live&&provider!.isFailure(live.status))current=await release(current.id,'Payment '+live.status)||current;
  else if(new Date(current.expires_at).getTime()<Date.now())current=await release(current.id,'Checkout expired')||current;
 }
 if(current.status!=='PAID')
  return {status:current.status,code:null,package_name:null,message:current.status==='REFUND_DUE'
   ?'Your payment arrived after the voucher was released. Show this screen to the attendant for a refund.'
   :current.status==='PENDING'?'Waiting for your payment.':'This purchase did not complete. No money was taken; you can try again.'};
 const sold=(await pool.query('select v.code_encrypted,v.package_name,v.duration_minutes from wifi.manual_sale_items i join wifi.vouchers v on v.id=i.voucher_id where i.sale_id=$1',[current.sale_id])).rows[0];
 requireValue(sold,409,'Payment received. Please ask the attendant for your code.');
 return {status:'PAID',code:present(decrypt(sold.code_encrypted)),package_name:sold.package_name,duration_minutes:sold.duration_minutes,message:null};
}

/** Housekeeping: free stock held by checkouts that were never completed. */
export async function expireStale(){
 const stale=(await pool.query("select id from wifi.payment_intents where status='PENDING' and expires_at<now() limit 50")).rows;
 for(const row of stale)await release(row.id,'Checkout expired').catch(()=>{});
 return stale.length;
}

/**
 * Every payment attempt, whatever became of it.
 *
 * A failed attempt is the one a customer actually comes to the counter about --
 * "I paid and got nothing" -- so it has to be findable by phone number or
 * reference, not just visible as an absence in the sales list.
 */
export async function attempts(query:{page?:number;q?:string;state?:string}){
 const page=query.page||1;
 const rows=(await pool.query(`select i.id,i.reference,i.provider,i.network,i.status,i.amount_tzs,i.customer_phone,
   i.failure_reason,i.provider_reference,i.created_at,i.paid_at,s.receipt_number,p.name package_name
  from wifi.payment_intents i
  left join wifi.manual_sales s on s.id=i.sale_id
  left join wifi.packages p on p.id=i.package_id
  where ($1='' or i.reference ilike $1 or i.customer_phone ilike $1 or i.provider_reference ilike $1)
    and ($2='' or i.status=$2)
  order by i.created_at desc limit 26 offset $3`,
  [query.q?'%'+query.q+'%':'',query.state||'',(page-1)*25])).rows;
 return {items:rows.slice(0,25),page,has_more:rows.length>25};
}
